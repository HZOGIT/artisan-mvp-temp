import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDevisRepository } from "../../application/devis-repository";
import { listDevis, getDevis, listLignesDevis } from "../../application/read-use-cases";
import {
  creerDevis,
  modifierDevis,
  supprimerDevis,
  ajouterLigneDevis,
  modifierLigneDevis,
  supprimerLigneDevis,
} from "../../application/write-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const ligneTypeEnum = z.enum(["produit", "section", "note"]);

// `dateValidite` arrive en string ISO (transport) ; le domaine attend une `Date | null`.
// `undefined` = champ non fourni (laissé tel quel), `null` = effacement explicite.
function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined || v === null) return v;
  return new Date(v);
}

// Bornes alignées sur les tables `devis`/`devis_lignes` (defense-in-depth). ⚠️ Le client NE
// fournit PAS `numero` (généré serveur), `statut` (workflow), ni les totaux (dérivés des lignes)
// → intégrité financière (numérotation maîtrisée + pas de total falsifiable).
const createSchema = z.object({
  clientId: z.number().int(),
  objet: z.string().max(500).nullish(),
  referenceClient: z.string().max(100).nullish(),
  conditionsPaiement: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  dateValidite: isoDate.nullish(),
});

// ⚠️ clientId / numero / statut / totaux ABSENTS : client immuable, numérotation maîtrisée,
// transitions de statut = workflow, totaux dérivés des lignes.
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

// Routeur tRPC du domaine devis. Transport mince : valide les inputs (zod), délègue aux use-cases
// (scoping tenant + numérotation serveur + anti-IDOR-FK + immutabilité post-acceptation via
// ctx.tenant), laisse remonter les Domain errors (NotFound→404, Validation→400, Conflict→409).
export function createDevisRouter(repo: IDevisRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listDevis(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getDevis(repo, ctx.tenant, input.id)),

    getLignes: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => listLignesDevis(repo, ctx.tenant, input.devisId)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerDevis(repo, ctx.tenant, { ...input, dateValidite: toDate(input.dateValidite) })),

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

    addLigne: protectedProcedure
      .input(z.object({ devisId: z.number().int() }).and(ligneCreateSchema))
      .mutation(({ ctx, input }) => {
        const { devisId, ...data } = input;
        return ajouterLigneDevis(repo, ctx.tenant, devisId, data);
      }),

    updateLigne: protectedProcedure
      .input(z.object({ id: z.number().int(), devisId: z.number().int() }).and(ligneUpdateSchema))
      .mutation(({ ctx, input }) => {
        const { id, devisId, ...data } = input;
        return modifierLigneDevis(repo, ctx.tenant, devisId, id, data);
      }),

    deleteLigne: protectedProcedure
      .input(z.object({ id: z.number().int(), devisId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerLigneDevis(repo, ctx.tenant, input.devisId, input.id);
        return { success: true };
      }),
  });
}
