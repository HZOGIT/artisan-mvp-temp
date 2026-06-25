import { z } from "zod";
import { router, protectedProcedure, permissionProcedure } from "../../../../interface/trpc/trpc";
import { TVA_CATEGORIES_MAP } from "../../../../shared/tva/taux-tva-fr";
/** Permissions (parité legacy) : actions sur lignes/envoi/duplication = `devis.creer` ; conversion en facture = `factures.creer`. */
const devisCreer = permissionProcedure("devis.creer");
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
  };
  const nonSignesDeps = { devisRepo: repo, clientReader: mailing.clientReader, signatureReader };
  return router({
    list: protectedProcedure.query(({ ctx }) => listDevis(repo, ctx.tenant)),

    /** Détail enrichi (parité legacy : `{ ...devis, lignes, client }`) — consommé par DevisDetail. */
    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getDevisDetail(repo, mailing.clientReader, ctx.tenant, input.id)),

    getLignes: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => listLignesDevis(repo, ctx.tenant, input.devisId)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        const result = await creerDevis(repo, ctx.tenant, { ...input, dateValidite: toDate(input.dateValidite) });
        ctx.log.info({ event: "devis_created", devisId: result.id, clientId: input.clientId }, "Devis créé");
        return result;
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, dateValidite, ...data } = input;
        return modifierDevis(repo, ctx.tenant, id, { ...data, dateValidite: toDate(dateValidite) });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerDevis(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    addLigne: devisCreer
      .input(z.object({ devisId: z.number().int() }).and(ligneCreateSchema))
      .mutation(({ ctx, input }) => {
        const { devisId, tvaCategorieId, ...data } = input;
        const categorieId = tvaCategorieId ?? "FR_20";
        const tauxTVA = TVA_CATEGORIES_MAP[categorieId].taux;
        return ajouterLigneDevis(repo, ctx.tenant, devisId, { ...data, tauxTVA, tvaCategorieId: categorieId });
      }),

    updateLigne: devisCreer
      .input(z.object({ id: z.number().int(), devisId: z.number().int() }).and(ligneUpdateSchema))
      .mutation(({ ctx, input }) => {
        const { id, devisId, tvaCategorieId, ...data } = input;
        const tauxTVA = tvaCategorieId ? TVA_CATEGORIES_MAP[tvaCategorieId].taux : undefined;
        return modifierLigneDevis(repo, ctx.tenant, devisId, id, { ...data, ...(tauxTVA !== undefined && { tauxTVA }), ...(tvaCategorieId !== undefined && { tvaCategorieId }) });
      }),

    deleteLigne: devisCreer
      .input(z.object({ id: z.number().int(), devisId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerLigneDevis(repo, ctx.tenant, input.devisId, input.id);
        return { success: true };
      }),

    /** Transitions de statut (machine à états dans le use-case : Conflict→409 si invalide). */
    envoyer: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await changerStatutDevis(repo, ctx.tenant, input.id, "envoye", mailing.artisanReader);
        ctx.log.info({ event: "devis_envoye", devisId: input.id }, "Devis envoyé au client");
        return result;
      }),

    accepter: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await changerStatutDevis(repo, ctx.tenant, input.id, "accepte");
        ctx.log.info({ event: "devis_accepte", devisId: input.id }, "Devis accepté");
        return result;
      }),

    refuser: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await changerStatutDevis(repo, ctx.tenant, input.id, "refuse");
        ctx.log.warn({ event: "devis_refuse", devisId: input.id }, "Devis refusé");
        return result;
      }),

    expirer: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => changerStatutDevis(repo, ctx.tenant, input.id, "expire")),

    /** ── Modèles de devis (gabarits réutilisables) exposés sous `devis.*` (parité client) ────────── */
    getModeles: protectedProcedure.query(({ ctx }) => listModelesDevis(modeleRepo, ctx.tenant)),

    getModeleWithLignes: protectedProcedure
      .input(z.object({ modeleId: z.number().int() }))
      .query(({ ctx, input }) => getModeleDevisAvecLignes(modeleRepo, ctx.tenant, input.modeleId)),

    createModele: protectedProcedure
      .input(z.object({ nom: z.string().min(1).max(255), description: z.string().max(2000).optional(), notes: z.string().max(5000).optional() }))
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
          tauxTVA: z.number().min(0).max(100).default(20),
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
        }),
      ),

    /** ── Relances de devis (email + journal append-only) ────────────────────────────────────────── */
    envoyerRelance: protectedProcedure
      .input(z.object({ devisId: z.number().int(), message: z.string().max(5000).optional() }))
      .mutation(({ ctx, input }) => envoyerRelanceDevis(relanceDeps, ctx.tenant, input)),

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
      .mutation(({ ctx, input }) => dupliquerDevis(repo, ctx.tenant, input.devisId)),

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
        }),
      )
      .mutation(({ ctx, input }) =>
        envoyerDevisParEmail(repo, mailing, ctx.tenant, {
          devisId: input.devisId,
          customMessage: input.customMessage,
          attachPdf: input.attachPdf,
        }),
      ),
  });
}
