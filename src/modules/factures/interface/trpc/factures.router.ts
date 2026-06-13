import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IFactureRepository } from "../../application/facture-repository";
import { listFactures, getFacture, listLignesFacture } from "../../application/read-use-cases";
import {
  creerFacture,
  modifierFacture,
  supprimerFacture,
  ajouterLigneFacture,
  modifierLigneFacture,
  supprimerLigneFacture,
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

// Routeur tRPC du domaine factures. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant + numérotation serveur + anti-IDOR-FK + immutabilité post-émission),
// laisse remonter les Domain errors (NotFound→404, Validation→400, Conflict→409).
export function createFacturesRouter(repo: IFactureRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listFactures(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getFacture(repo, ctx.tenant, input.id)),

    getLignes: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => listLignesFacture(repo, ctx.tenant, input.factureId)),

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
  });
}
