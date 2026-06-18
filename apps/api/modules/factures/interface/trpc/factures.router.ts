import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IFactureRepository } from "../../application/facture-repository";
import type { IDevisReader } from "../../application/devis-reader";
import type { ComptaPort } from "../../application/compta-port";
import type { FactureMailingDeps } from "../../application/envoyer-facture-email";
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
  marquerFacturePayee,
  creerAvoir,
  convertirDevisEnFacture,
} from "../../application/write-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const ligneTypeEnum = z.enum(["produit", "section", "note"]);
const typeDocumentEnum = z.enum(["facture", "avoir"]);

// `dateEcheance` arrive en string ISO (transport) ; le domaine attend une `Date | null`.
function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined || v === null) return v;
  return new Date(v);
}

// Bornes alignées sur les tables `factures`/`factures_lignes` (defense-in-depth). ⚠️ Le client NE
// fournit PAS `numero` (généré serveur), `statut` (workflow), totaux ni `montantPaye` (dérivés/
// paiement) → intégrité financière (numérotation maîtrisée + pas de total/paiement falsifiable).
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
});

// ⚠️ clientId / devisId / numero / statut / typeDocument / totaux / montantPaye ABSENTS.
const updateSchema = z.object({
  objet: z.string().max(500).nullish(),
  referenceClient: z.string().max(100).nullish(),
  siretDestinataire: z.string().max(14).nullish(),
  conditionsPaiement: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  dateEcheance: isoDate.nullish(),
});

const ligneCreateSchema = z.object({
  designation: z.string().min(1).max(500),
  prixUnitaireHT: decimal,
  quantite: decimal.optional(),
  unite: z.string().max(20).optional(),
  tauxTVA: decimal.optional(),
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
  tauxTVA: decimal.optional(),
  reference: z.string().max(50).nullish(),
  description: z.string().max(5000).nullish(),
  ordre: z.number().int().optional(),
  type: ligneTypeEnum.optional(),
});

// Schéma d'avoir partagé par `creerAvoir` et son alias client `createAvoir` (même use-case).
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
        tauxTVA: decimal.optional(),
        unite: z.string().max(20).nullish(),
        description: z.string().max(5000).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

// Routeur tRPC du domaine factures. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant + numérotation serveur + anti-IDOR-FK + immutabilité post-émission),
// laisse remonter les Domain errors (NotFound→404, Validation→400, Conflict→409).
export function createFacturesRouter(repo: IFactureRepository, devisReader: IDevisReader, compta: ComptaPort, mailing: FactureMailingDeps) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listFactures(repo, ctx.tenant)),

    // Détail enrichi (parité legacy : `{ ...facture, lignes, client }`) — consommé par FactureDetail.
    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getFactureDetail(repo, mailing.clientReader, ctx.tenant, input.id)),

    getLignes: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => listLignesFacture(repo, ctx.tenant, input.factureId)),

    // Avoirs émis sur une facture (parité client `trpc.factures.getAvoirsByFacture`). Lecture seule,
    // scopée tenant (→ [] hors tenant, comme le legacy).
    getAvoirsByFacture: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => getAvoirsFacture(repo, ctx.tenant, input.factureId)),

    // Journal d'audit d'une facture (parité client `trpc.factures.getAuditLog`). Lecture seule, scopée.
    getAuditLog: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => getAuditLogFacture(repo, ctx.tenant, input.factureId)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerFacture(repo, ctx.tenant, { ...input, dateEcheance: toDate(input.dateEcheance) })),

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
        const { factureId, ...data } = input;
        return ajouterLigneFacture(repo, ctx.tenant, factureId, data);
      }),

    updateLigne: protectedProcedure
      .input(z.object({ id: z.number().int(), factureId: z.number().int() }).and(ligneUpdateSchema))
      .mutation(({ ctx, input }) => {
        const { id, factureId, ...data } = input;
        return modifierLigneFacture(repo, ctx.tenant, factureId, id, data);
      }),

    deleteLigne: protectedProcedure
      .input(z.object({ id: z.number().int(), factureId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerLigneFacture(repo, ctx.tenant, input.factureId, input.id);
        return { success: true };
      }),

    // Transitions de statut (machine à états dans le use-case : Conflict→409 si invalide).
    // ⚠️ Le passage à `payee` se fait via le paiement (étape ultérieure), pas ici.
    envoyer: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => changerStatutFacture(repo, ctx.tenant, input.id, "envoyee", compta)),

    marquerEnRetard: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => changerStatutFacture(repo, ctx.tenant, input.id, "en_retard")),

    // Convertir un devis accepté en facture (cross-domaine : lit le devis via le reader injecté).
    convertirDepuisDevis: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .mutation(({ ctx, input }) => convertirDevisEnFacture(repo, devisReader, ctx.tenant, input.devisId)),

    // Émettre un avoir (note de crédit) sur une facture d'origine — montants négatifs.
    creerAvoir: protectedProcedure.input(avoirInputSchema).mutation(({ ctx, input }) => {
      const { factureOrigineId, ...data } = input;
      return creerAvoir(repo, ctx.tenant, factureOrigineId, data, compta);
    }),

    // Alias de surface (parité client `trpc.factures.createAvoir`) : même use-case que `creerAvoir`.
    createAvoir: protectedProcedure.input(avoirInputSchema).mutation(({ ctx, input }) => {
      const { factureOrigineId, ...data } = input;
      return creerAvoir(repo, ctx.tenant, factureOrigineId, data, compta);
    }),

    // Enregistrement d'un paiement (partiel ou soldant) — passe `payee` si soldée.
    enregistrerPaiement: protectedProcedure
      .input(z.object({ id: z.number().int(), montant: decimal, date: isoDate.optional(), mode: z.string().max(50).optional() }))
      .mutation(({ ctx, input }) =>
        enregistrerPaiementFacture(
          repo,
          ctx.tenant,
          input.id,
          { montant: input.montant, date: toDate(input.date), mode: input.mode ?? null },
          compta,
        ),
      ),

    // Marquer payée (parité client `trpc.factures.markAsPaid`) : écrase montantPaye + force `payee` +
    // génère les écritures FEC (vente + encaissement) via le ComptaPort. ⚠️ sémantique legacy (non cumulatif).
    markAsPaid: protectedProcedure
      .input(z.object({ id: z.number().int(), montantPaye: decimal, datePaiement: z.string() }))
      .mutation(({ ctx, input }) =>
        marquerFacturePayee(repo, ctx.tenant, input.id, { montantPaye: input.montantPaye, datePaiement: input.datePaiement }, compta),
      ),

    // Envoi de la facture par email (PDF en pièce jointe) — parité client `trpc.factures.sendByEmail`.
    // ownership 404 / client.email 400 / rate-limit 429 ; passe `envoyee` si brouillon/validee (sans FEC).
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
