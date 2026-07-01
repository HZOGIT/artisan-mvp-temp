import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure, permissionProcedure } from "../../../../interface/trpc/trpc";
import { TVA_CATEGORIES_MAP } from "../../../../shared/tva/taux-tva-fr";
import type { DbClient } from "../../../../shared/db";
import type { PushPort } from "../../../../shared/push/web-push-adapter";
import type { EventBusPort } from "../../../../shared/ports/event-bus";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { signaturesDevis } from "../../../../../../drizzle/schema.pg";
/** Permissions (parité legacy) : actions sur lignes/envoi/duplication = `devis.creer` ; conversion en facture = `factures.creer`. */
const devisVoir = permissionProcedure("devis.voir");
const devisCreer = permissionProcedure("devis.creer");
const devisSupprimer = permissionProcedure("devis.supprimer");
const facturesCreer = permissionProcedure("factures.creer");
import type { IDevisRepository } from "../../application/devis-repository";
import { listDevis, getDevisDetail, listLignesDevis } from "../../application/read-use-cases";
import { envoyerDevisParEmail, type DevisMailingDeps } from "../../application/envoyer-devis-email";
import type { DevisToFactureConverter } from "../../application/devis-to-facture-converter";
import type { IModeleDevisRepository } from "../../../modeles-devis/application/modele-devis-repository";
import { listModelesDevis, getModeleDevisAvecLignes } from "../../../modeles-devis/application/read-use-cases";
import { creerModeleDevis, ajouterLigneModeleDevis } from "../../../modeles-devis/application/write-use-cases";
import type { IRelanceDevisRepository } from "../../../relances-devis/application/relance-devis-repository";
import { envoyerRelanceDevis, envoyerRelancesAutomatiques } from "../../application/relances-devis";
import { genererLignesDevisIA, type DevisIaDeps } from "../../application/generer-lignes-ia";
import { getDevisNonSignes } from "../../application/get-devis-non-signes";
import type { DevisSignatureReader } from "../../application/devis-signature-reader";
import {
  creerDevis,
  modifierDevis,
  supprimerDevis,
  ajouterLigneDevis,
  modifierLigneDevis,
  supprimerLigneDevis,
  changerStatutDevis,
  dupliquerDevis,
} from "../../application/write-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const ligneTypeEnum = z.enum(["produit", "section", "note"]);
const tvaCategorieEnum = z.enum(["FR_20", "FR_10", "FR_5_5", "FR_2_1", "FR_FRANCHISE", "FR_EXONERE", "FR_AUTO"]);

/*
 * `dateValidite` arrive en string ISO (transport) ; le domaine attend une `Date | null`.
 * `undefined` = champ non fourni (laissé tel quel), `null` = effacement explicite.
 */
function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined || v === null) return v;
  return new Date(v);
}

/*
 * Bornes alignées sur les tables `devis`/`devis_lignes` (defense-in-depth). ⚠️ Le client NE
 * fournit PAS `numero` (généré serveur), `statut` (workflow), ni les totaux (dérivés des lignes)
 * → intégrité financière (numérotation maîtrisée + pas de total falsifiable).
 */
const createSchema = z.object({
  clientId: z.number().int(),
  objet: z.string().max(500).nullish(),
  referenceClient: z.string().max(100).nullish(),
  conditionsPaiement: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  dateValidite: isoDate.nullish(),
});

/*
 * ⚠️ clientId / numero / statut / totaux ABSENTS : client immuable, numérotation maîtrisée,
 * transitions de statut = workflow, totaux dérivés des lignes.
 */
const updateSchema = z.object({
  objet: z.string().max(500).nullish(),
  referenceClient: z.string().max(100).nullish(),
  conditionsPaiement: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  dateValidite: isoDate.nullish(),
});

const ligneCreateSchema = z.object({
  designation: z.string().min(1).max(500),
  prixUnitaireHT: decimal,
  quantite: decimal.optional(),
  unite: z.string().max(20).optional(),
  tvaCategorieId: tvaCategorieEnum.optional(),
  reference: z.string().max(50).nullish(),
  description: z.string().max(5000).nullish(),
  ordre: z.number().int().optional(),
  type: ligneTypeEnum.optional(),
  remise: z.number().min(0).max(100).default(0),
});

const ligneUpdateSchema = z.object({
  designation: z.string().min(1).max(500).optional(),
  prixUnitaireHT: decimal.optional(),
  quantite: decimal.optional(),
  unite: z.string().max(20).optional(),
  tvaCategorieId: tvaCategorieEnum.optional(),
  reference: z.string().max(50).nullish(),
  description: z.string().max(5000).nullish(),
  ordre: z.number().int().optional(),
  type: ligneTypeEnum.optional(),
  remise: z.number().min(0).max(100).optional(),
});

/*
 * Routeur tRPC du domaine devis. Transport mince : valide les inputs (zod), délègue aux use-cases
 * (scoping tenant + numérotation serveur + anti-IDOR-FK + immutabilité post-acceptation via
 * ctx.tenant), laisse remonter les Domain errors (NotFound→404, Validation→400, Conflict→409).
 */
export function createDevisRouter(
  repo: IDevisRepository,
  mailing: DevisMailingDeps,
  converter: DevisToFactureConverter,
  modeleRepo: IModeleDevisRepository,
  relanceRepo: IRelanceDevisRepository,
  signatureReader: DevisSignatureReader,
  ia: DevisIaDeps,
  push?: PushPort,
  _eventBus?: EventBusPort,
  db?: DbClient,
) {
  /** Dépendances de relance (réutilise les readers/email/rate-limiter du mailing + le repo relances). */
  const relanceDeps = {
    devisRepo: repo,
    relanceRepo,
    clientReader: mailing.clientReader,
    artisanReader: mailing.artisanReader,
    email: mailing.email,
    rateLimiter: mailing.rateLimiter,
    modeleEmailRepo: mailing.modeleEmailRepo,
    emailLogWriter: mailing.emailLogWriter,
    signatureReader,
    appUrl: mailing.appUrl,
  };
  const nonSignesDeps = { devisRepo: repo, clientReader: mailing.clientReader, signatureReader };
  return router({
    list: devisVoir.query(({ ctx }) => listDevis(repo, ctx.tenant)),

    /** Détail enrichi (parité legacy : `{ ...devis, lignes, client }`) — consommé par DevisDetail. */
    getById: devisVoir
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getDevisDetail(repo, mailing.clientReader, ctx.tenant, input.id)),

    getLignes: devisVoir
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => listLignesDevis(repo, ctx.tenant, input.devisId)),

    create: devisCreer
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        const parsed = { ...input, dateValidite: toDate(input.dateValidite) };
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerDevis(r, ctx.tenant, parsed);
          ctx.log.info({ event: "devis_created", devisId: result.id, clientId: input.clientId }, "Devis créé");
          push?.sendToUser(ctx.tenant.artisanId, { title: "Operioz", body: `Nouveau devis ${result.numero} créé` }).catch(() => undefined);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.cree", entityType: "devis", entityId: result.id, payload: { numero: result.numero, clientId: result.clientId, totalTTC: result.totalTTC, statut: result.statut } });
          return result;
        });
      }),

    update: devisCreer
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, dateValidite, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierDevis(r, ctx.tenant, id, { ...data, dateValidite: toDate(dateValidite) });
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.modifie", entityType: "devis", entityId: id, payload: { objet: result.objet, referenceClient: result.referenceClient } });
          return result;
        });
      }),

    delete: devisSupprimer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerDevis(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.supprime", entityType: "devis", entityId: input.id, payload: { snapshot: { numero: before?.numero, totalTTC: before?.totalTTC, statut: before?.statut, clientId: before?.clientId } } });
          return { success: true };
        });
      }),

    addLigne: devisCreer
      .input(z.object({ devisId: z.number().int() }).and(ligneCreateSchema))
      .mutation(async ({ ctx, input }) => {
        const { devisId, tvaCategorieId, remise: remiseNum, ...data } = input;
        const effectiveCategorieId = ctx.tenant.franchiseTVA && (!tvaCategorieId || tvaCategorieId === "FR_20") ? "FR_FRANCHISE" : (tvaCategorieId ?? "FR_20");
        const tauxTVA = TVA_CATEGORIES_MAP[effectiveCategorieId].taux;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await ajouterLigneDevis(r, ctx.tenant, devisId, { ...data, tauxTVA, tvaCategorieId: effectiveCategorieId, remise: String(remiseNum ?? 0) });
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.ligne_ajoutee", entityType: "devis", entityId: devisId, payload: { ligneId: result.id, designation: result.designation, prixUnitaireHT: result.prixUnitaireHT } });
          return result;
        });
      }),

    updateLigne: devisCreer
      .input(z.object({ id: z.number().int(), devisId: z.number().int() }).and(ligneUpdateSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, devisId, tvaCategorieId, remise: remiseNum, ...data } = input;
        const tauxTVA = tvaCategorieId ? TVA_CATEGORIES_MAP[tvaCategorieId].taux : undefined;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierLigneDevis(r, ctx.tenant, devisId, id, { ...data, ...(tauxTVA !== undefined && { tauxTVA }), ...(tvaCategorieId !== undefined && { tvaCategorieId }), ...(remiseNum !== undefined && { remise: String(remiseNum) }) });
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.ligne_modifiee", entityType: "devis", entityId: devisId, payload: { ligneId: id, designation: result.designation, prixUnitaireHT: result.prixUnitaireHT } });
          return result;
        });
      }),

    deleteLigne: devisCreer
      .input(z.object({ id: z.number().int(), devisId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          await supprimerLigneDevis(r, ctx.tenant, input.devisId, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.ligne_supprimee", entityType: "devis", entityId: input.devisId, payload: { ligneId: input.id } });
          return { success: true };
        });
      }),

    /** Transitions de statut (machine à états dans le use-case : Conflict→409 si invalide). */
    envoyer: devisCreer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await changerStatutDevis(r, ctx.tenant, input.id, "envoye", mailing.artisanReader);
          ctx.log.info({ event: "devis_envoye", devisId: input.id }, "Devis envoyé au client");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.envoye", entityType: "devis", entityId: input.id, payload: { totalTTC: result.totalTTC, numero: result.numero } });
          return result;
        });
      }),

    accepter: devisCreer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await changerStatutDevis(r, ctx.tenant, input.id, "accepte");
          ctx.log.info({ event: "devis_accepte", devisId: input.id }, "Devis accepté");
          const closeSignatures = (client: DbClient) =>
            client.update(signaturesDevis).set({ statut: "annulee" }).where(and(eq(signaturesDevis.devisId, input.id), eq(signaturesDevis.statut, "en_attente")));
          if (tx) {
            await closeSignatures(tx);
            await outboxEvent(tx, ctx.tenant, { action: "devis.accepte", entityType: "devis", entityId: input.id, payload: { totalTTC: result.totalTTC, numero: result.numero } });
          } else if (db) {
            await closeSignatures(db);
          }
          return result;
        });
      }),

    refuser: devisCreer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await changerStatutDevis(r, ctx.tenant, input.id, "refuse");
          ctx.log.warn({ event: "devis_refuse", devisId: input.id }, "Devis refusé");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.refuse", entityType: "devis", entityId: input.id, payload: { totalTTC: result.totalTTC } });
          return result;
        });
      }),

    expirer: devisCreer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await changerStatutDevis(r, ctx.tenant, input.id, "expire");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.expire", entityType: "devis", entityId: input.id, payload: { totalTTC: result.totalTTC } });
          return result;
        });
      }),

    /** ── Modèles de devis (gabarits réutilisables) exposés sous `devis.*` (parité client) ────────── */
    getModeles: devisVoir.query(({ ctx }) => listModelesDevis(modeleRepo, ctx.tenant)),

    getModeleWithLignes: devisVoir
      .input(z.object({ modeleId: z.number().int() }))
      .query(({ ctx, input }) => getModeleDevisAvecLignes(modeleRepo, ctx.tenant, input.modeleId)),

    createModele: protectedProcedure
      .input(z.object({
        nom: z.string().min(1).max(255),
        description: z.string().max(2000).nullish(),
        notes: z.string().max(5000).nullish(),
        dureeValiditeJours: z.number().int().positive().nullish(),
        conditionsPaiementDefaut: z.string().max(2000).nullish(),
        objetType: z.string().max(500).nullish(),
      }))
      .mutation(({ ctx, input }) => creerModeleDevis(modeleRepo, ctx.tenant, input)),

    /** Le client envoie des NOMBRES (quantite/prix/TVA) ; le domaine attend des décimaux string. */
    addLigneToModele: protectedProcedure
      .input(
        z.object({
          modeleId: z.number().int(),
          articleId: z.number().int().optional(),
          designation: z.string().min(1).max(255),
          description: z.string().max(5000).optional(),
          quantite: z.number().default(1),
          unite: z.string().max(20).default("unité"),
          prixUnitaireHT: z.number().default(0),
          tauxTVA: z.number().refine((v) => [0, 2.1, 5.5, 10, 20].includes(v), "Taux TVA hors catalogue légal FR").default(20),
          remise: z.number().min(0).max(100).default(0),
          tvaCategorieId: z.string().max(30).optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        ajouterLigneModeleDevis(modeleRepo, ctx.tenant, input.modeleId, {
          articleId: input.articleId ?? null,
          designation: input.designation,
          description: input.description ?? null,
          quantite: String(input.quantite),
          unite: input.unite,
          prixUnitaireHT: String(input.prixUnitaireHT),
          tauxTVA: String(input.tauxTVA),
          remise: String(input.remise),
          tvaCategorieId: input.tvaCategorieId ?? null,
        }),
      ),

    /** ── Relances de devis (email + journal append-only) ────────────────────────────────────────── */
    envoyerRelance: protectedProcedure
      .input(z.object({ devisId: z.number().int(), message: z.string().max(5000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await envoyerRelanceDevis(relanceDeps, ctx.tenant, input);
        const tx = db;
        if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.relance_envoyee", entityType: "devis", entityId: input.devisId, payload: {} });
        return result;
      }),

    envoyerRelancesAutomatiques: protectedProcedure
      .input(z.object({ joursMinimum: z.number().int().min(0).optional(), joursEntreRelances: z.number().int().min(0).optional() }))
      .mutation(({ ctx, input }) => envoyerRelancesAutomatiques(relanceDeps, ctx.tenant, input)),

    /** Devis non signés (≥ N jours) enrichis client + signature — parité `getDevisNonSignes`. */
    getDevisNonSignes: protectedProcedure
      .input(z.object({ joursMinimum: z.number().int().min(0).optional() }).optional())
      .query(({ ctx, input }) => getDevisNonSignes(nonSignesDeps, ctx.tenant, input ?? {})),

    /** Génération IA de lignes de devis depuis une description (LECTURE SEULE, non persistée). */
    genererLignesIA: protectedProcedure
      .input(z.object({ description: z.string().min(5).max(5000), surface: z.number().optional(), budget: z.number().optional() }))
      .mutation(({ ctx, input }) => genererLignesDevisIA(ia, ctx.tenant, input)),

    /*
     * Convertit un devis accepté en facture brouillon (cross-domaine) — parité `convertToFacture`.
     * 404 devis hors tenant ; Conflict si non accepté ou déjà converti (invariants factures).
     */
    convertToFacture: facturesCreer
      .input(z.object({ devisId: z.number().int() }))
      .mutation(({ ctx, input }) => converter.convertir(ctx.tenant, input.devisId)),

    /** Duplique un devis (nouveau brouillon, numéro serveur, lignes copiées) — parité `duplicate`. */
    duplicate: devisCreer
      .input(z.object({ devisId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await dupliquerDevis(r, ctx.tenant, input.devisId);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.duplique", entityType: "devis", entityId: result.id, payload: { sourceId: input.devisId, numero: result.numero } });
          return result;
        });
      }),

    /*
     * Envoi du devis par email (PDF en PJ) — parité client `trpc.devis.sendByEmail`.
     * ownership 404 / client.email 400 / rate-limit 429 ; passe `envoye` si brouillon.
     */
    sendByEmail: devisCreer
      .input(
        z.object({
          devisId: z.number().int(),
          customMessage: z.string().max(5000).optional(),
          attachPdf: z.boolean().optional().default(true),
          pieceJointeIds: z.array(z.number().int()).max(10).optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const result = await envoyerDevisParEmail(r, mailing, ctx.tenant, {
            devisId: input.devisId,
            customMessage: input.customMessage,
            attachPdf: input.attachPdf,
            pieceJointeIds: input.pieceJointeIds,
          });
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "devis.email_envoye", entityType: "devis", entityId: input.devisId, payload: {} });
          return result;
        }),
      ),
  });
}
