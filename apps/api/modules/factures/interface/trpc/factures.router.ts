import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import { TVA_CATEGORIES_MAP } from "../../../../shared/tva/taux-tva-fr";
import type { IFactureRepository } from "../../application/facture-repository";
import type { IDevisReader } from "../../application/devis-reader";
import type { ComptaPort } from "../../application/compta-port";
import type { FactureMailingDeps } from "../../application/envoyer-facture-email";
import type { PushPort } from "../../../../shared/push/web-push-adapter";
import type { DbClient } from "../../../../shared/db";
import type { EventBusPort } from "../../../../shared/ports/event-bus";
import { emitEvent } from "../../../../shared/events/emit-event";
import { envoyerFactureParEmail } from "../../application/envoyer-facture-email";
import { listFactures, getFactureDetail, listLignesFacture, getAvoirsFacture, getAuditLogFacture } from "../../application/read-use-cases";
import {
  creerFacture,
  modifierFacture,
  supprimerFacture,
  ajouterLigneFacture,
  modifierLigneFacture,
  supprimerLigneFacture,
  changerStatutFacture,
  enregistrerPaiementFacture,
  creerAvoir,
  convertirDevisEnFacture,
} from "../../application/write-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const ligneTypeEnum = z.enum(["produit", "section", "note"]);
const typeDocumentEnum = z.enum(["facture", "avoir"]);
const tvaCategorieEnum = z.enum(["FR_20", "FR_10", "FR_5_5", "FR_2_1", "FR_FRANCHISE", "FR_EXONERE", "FR_AUTO"]);

/** `dateEcheance` arrive en string ISO (transport) ; le domaine attend une `Date | null`. */
function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined || v === null) return v;
  return new Date(v);
}

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

/*
 * Bornes alignées sur les tables `factures`/`factures_lignes` (defense-in-depth). ⚠️ Le client NE
 * fournit PAS `numero` (généré serveur), `statut` (workflow), totaux ni `montantPaye` (dérivés/
 * paiement) → intégrité financière (numérotation maîtrisée + pas de total/paiement falsifiable).
 */
const createSchema = z.object({
  clientId: z.number().int(),
  devisId: z.number().int().nullish(),
  typeDocument: typeDocumentEnum.optional(),
  factureOrigineId: z.number().int().nullish(),
  objet: z.string().max(500).nullish(),
  referenceClient: z.string().max(100).nullish(),
  siretDestinataire: z.string().max(14).nullish(),
  conditionsPaiement: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  dateEcheance: isoDate.nullish(),
  /** Lignes initiales — insérées dans la même transaction que le header (évite les headers orphelins). */
  lignes: z.array(ligneCreateSchema).max(500).optional(),
});

/** ⚠️ clientId / devisId / numero / statut / typeDocument / totaux / montantPaye ABSENTS. */
const updateSchema = z.object({
  objet: z.string().max(500).nullish(),
  referenceClient: z.string().max(100).nullish(),
  siretDestinataire: z.string().max(14).nullish(),
  conditionsPaiement: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  dateEcheance: isoDate.nullish(),
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

/** Schéma d'avoir partagé par `creerAvoir` et son alias client `createAvoir` (même use-case). */
const avoirInputSchema = z.object({
  factureOrigineId: z.number().int(),
  objet: z.string().max(500).nullish(),
  notes: z.string().max(5000).nullish(),
  lignes: z
    .array(
      z.object({
        designation: z.string().min(1).max(500),
        quantite: decimal,
        prixUnitaireHT: decimal,
        tvaCategorieId: tvaCategorieEnum.optional(),
        unite: z.string().max(20).nullish(),
        description: z.string().max(5000).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

/*
 * Routeur tRPC du domaine factures. Transport mince : valide les inputs (zod), délègue aux
 * use-cases (scoping tenant + numérotation serveur + anti-IDOR-FK + immutabilité post-émission),
 * laisse remonter les Domain errors (NotFound→404, Validation→400, Conflict→409).
 */
export function createFacturesRouter(repo: IFactureRepository, devisReader: IDevisReader, compta: ComptaPort, mailing: FactureMailingDeps, push?: PushPort, outboxInTx?: (artisanId: number, factureId: number, tx: DbClient) => Promise<void>, eventBus?: EventBusPort) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listFactures(repo, ctx.tenant)),

    /** Détail enrichi (parité legacy : `{ ...facture, lignes, client }`) — consommé par FactureDetail. */
    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getFactureDetail(repo, mailing.clientReader, ctx.tenant, input.id)),

    getLignes: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => listLignesFacture(repo, ctx.tenant, input.factureId)),

    /*
     * Avoirs émis sur une facture (parité client `trpc.factures.getAvoirsByFacture`). Lecture seule,
     * scopée tenant (→ [] hors tenant, comme le legacy).
     */
    getAvoirsByFacture: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => getAvoirsFacture(repo, ctx.tenant, input.factureId)),

    /** Journal d'audit d'une facture (parité client `trpc.factures.getAuditLog`). Lecture seule, scopée. */
    getAuditLog: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => getAuditLogFacture(repo, ctx.tenant, input.factureId)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        const { lignes: rawLignes, ...rest } = input;
        const lignes = rawLignes?.map(({ tvaCategorieId, remise: remiseNum, ...l }) => {
          const categorieId = tvaCategorieId ?? "FR_20";
          return { ...l, tauxTVA: TVA_CATEGORIES_MAP[categorieId].taux, tvaCategorieId: categorieId, remise: String(remiseNum ?? 0) };
        });
        const result = await creerFacture(repo, ctx.tenant, { ...rest, dateEcheance: toDate(rest.dateEcheance), lignes });
        ctx.log.info({ event: "facture_created", factureId: result.id, clientId: rest.clientId }, "Facture créée");
        push?.sendToUser(ctx.tenant.artisanId, { title: "Operioz", body: `Nouvelle facture créée (brouillon)` }).catch(() => undefined);
        if (eventBus) {
          /* TODO: migrer vers withOutbox + outboxEvent (OPE-647 fan-out) */
          /* eslint-disable-next-line local/events-outbox-convention */
          emitEvent(eventBus, ctx.tenant, { type: "facture.creee", entityType: "facture", entityId: result.id, payload: { clientId: rest.clientId, numero: result.numero ?? null } });
        }
        return result;
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, dateEcheance, ...data } = input;
        return modifierFacture(repo, ctx.tenant, id, { ...data, dateEcheance: toDate(dateEcheance) });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerFacture(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    addLigne: protectedProcedure
      .input(z.object({ factureId: z.number().int() }).and(ligneCreateSchema))
      .mutation(({ ctx, input }) => {
        const { factureId, tvaCategorieId, remise: remiseNum, ...data } = input;
        const effectiveCategorieId = ctx.tenant.franchiseTVA && (!tvaCategorieId || tvaCategorieId === "FR_20") ? "FR_FRANCHISE" : (tvaCategorieId ?? "FR_20");
        const tauxTVA = TVA_CATEGORIES_MAP[effectiveCategorieId].taux;
        return ajouterLigneFacture(repo, ctx.tenant, factureId, { ...data, tauxTVA, tvaCategorieId: effectiveCategorieId, remise: String(remiseNum ?? 0) });
      }),

    updateLigne: protectedProcedure
      .input(z.object({ id: z.number().int(), factureId: z.number().int() }).and(ligneUpdateSchema))
      .mutation(({ ctx, input }) => {
        const { id, factureId, tvaCategorieId, remise: remiseNum, ...data } = input;
        const tauxTVA = tvaCategorieId ? TVA_CATEGORIES_MAP[tvaCategorieId].taux : undefined;
        return modifierLigneFacture(repo, ctx.tenant, factureId, id, { ...data, ...(tauxTVA !== undefined && { tauxTVA }), ...(tvaCategorieId !== undefined && { tvaCategorieId }), ...(remiseNum !== undefined && { remise: String(remiseNum) }) });
      }),

    deleteLigne: protectedProcedure
      .input(z.object({ id: z.number().int(), factureId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerLigneFacture(repo, ctx.tenant, input.factureId, input.id);
        return { success: true };
      }),

    /*
     * Transitions de statut (machine à états dans le use-case : Conflict→409 si invalide).
     * ⚠️ Le passage à `payee` se fait via le paiement (étape ultérieure), pas ici.
     */
    envoyer: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await changerStatutFacture(repo, ctx.tenant, input.id, "envoyee", compta, mailing.artisanReader, outboxInTx);
        ctx.log.info({ event: "facture_envoyee", factureId: input.id }, "Facture envoyée au client");
        if (eventBus) {
          /* TODO: migrer vers withOutbox + outboxEvent (OPE-647 fan-out) */
          /* eslint-disable-next-line local/events-outbox-convention */
          emitEvent(eventBus, ctx.tenant, { type: "facture.envoyee", entityType: "facture", entityId: input.id });
        }
        return result;
      }),

    marquerEnRetard: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => changerStatutFacture(repo, ctx.tenant, input.id, "en_retard")),

    /** Convertir un devis accepté en facture (cross-domaine : lit le devis via le reader injecté). */
    convertirDepuisDevis: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await convertirDevisEnFacture(repo, devisReader, ctx.tenant, input.devisId);
        ctx.log.info({ event: "facture_depuis_devis", factureId: result.id, devisId: input.devisId }, "Devis converti en facture");
        return result;
      }),

    /** Émettre un avoir (note de crédit) sur une facture d'origine — montants négatifs. */
    creerAvoir: protectedProcedure.input(avoirInputSchema).mutation(({ ctx, input }) => {
      const { factureOrigineId, ...data } = input;
      return creerAvoir(repo, ctx.tenant, factureOrigineId, data, compta);
    }),

    /** Alias de surface (parité client `trpc.factures.createAvoir`) : même use-case que `creerAvoir`. */
    createAvoir: protectedProcedure.input(avoirInputSchema).mutation(({ ctx, input }) => {
      const { factureOrigineId, ...data } = input;
      return creerAvoir(repo, ctx.tenant, factureOrigineId, data, compta);
    }),

    /** Enregistrement d'un paiement (partiel ou soldant) — passe `payee` si soldée. */
    enregistrerPaiement: protectedProcedure
      .input(z.object({ id: z.number().int(), montant: decimal, date: isoDate.optional(), mode: z.string().max(50).optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await enregistrerPaiementFacture(
          repo,
          ctx.tenant,
          input.id,
          { montant: input.montant, date: toDate(input.date), mode: input.mode ?? null },
          compta,
        );
        ctx.log.info({ event: "facture_paiement_enregistre", factureId: input.id, montant: Number(input.montant), mode: input.mode ?? null }, "Paiement facture enregistré");
        if (eventBus) {
          /* TODO: migrer vers withOutbox + outboxEvent (OPE-647 fan-out) */
          /* eslint-disable-next-line local/events-outbox-convention */
          emitEvent(eventBus, ctx.tenant, { type: "facture.paiement_enregistre", entityType: "facture", entityId: input.id, payload: { montant: input.montant, mode: input.mode ?? null } });
        }
        return result;
      }),

    /*
     * Paiement partiel ou soldant (parité client `trpc.factures.markAsPaid`) : cumule montantPaye,
     * marque `payee` uniquement si totalTTC soldé, génère les écritures FEC. Date invalide → 400.
     */
    markAsPaid: protectedProcedure
      .input(z.object({ id: z.number().int(), montantPaye: decimal, datePaiement: isoDate }))
      .mutation(async ({ ctx, input }) => {
        const result = await enregistrerPaiementFacture(repo, ctx.tenant, input.id, { montant: input.montantPaye, date: toDate(input.datePaiement) }, compta);
        ctx.log.info({ event: "facture_paiement_enregistre", factureId: input.id, montant: Number(input.montantPaye) }, "Paiement facture enregistré");
        if (eventBus) {
          /* TODO: migrer vers withOutbox + outboxEvent (OPE-647 fan-out) */
          /* eslint-disable-next-line local/events-outbox-convention */
          emitEvent(eventBus, ctx.tenant, { type: "facture.paiement_enregistre", entityType: "facture", entityId: input.id, payload: { montant: input.montantPaye } });
        }
        return result;
      }),

    /*
     * Envoi de la facture par email (PDF en pièce jointe) — parité client `trpc.factures.sendByEmail`.
     * ownership 404 / client.email 400 / rate-limit 429 ; passe `envoyee` si brouillon/validee (sans FEC).
     */
    sendByEmail: protectedProcedure
      .input(
        z.object({
          factureId: z.number().int(),
          customMessage: z.string().max(5000).optional(),
          attachPdf: z.boolean().optional().default(true),
        }),
      )
      .mutation(({ ctx, input }) =>
        envoyerFactureParEmail(repo, mailing, ctx.tenant, {
          factureId: input.factureId,
          customMessage: input.customMessage,
          attachPdf: input.attachPdf,
        }),
      ),
  });
}
