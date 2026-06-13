import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDepenseRepository } from "../../application/depense-repository";
import { listDepenses, getDepense } from "../../application/read-use-cases";
import { creerDepense, modifierDepense, supprimerDepense } from "../../application/write-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const modePaiementEnum = z.enum(["carte", "especes", "virement", "cheque", "prelevement"]);
const frequenceEnum = z.enum(["mensuelle", "trimestrielle", "annuelle"]);

// Bornes alignées sur la table `depenses` (defense-in-depth). ⚠️ Le client NE fournit PAS
// `numero` (généré côté serveur), ni `userId` (forcé au créateur), ni `montantTva`/`montantTtc`
// (dérivés côté serveur de montantHt+tauxTva) → garde l'intégrité comptable (numérotation
// maîtrisée + pas de TTC falsifiable).
const createSchema = z.object({
  dateDepense: isoDate,
  categorie: z.string().min(1).max(50),
  montantHt: decimal,
  tauxTva: decimal.optional(),
  fournisseur: z.string().max(255).nullish(),
  sousCategorie: z.string().max(100).nullish(),
  description: z.string().max(2000).nullish(),
  modePaiement: modePaiementEnum.optional(),
  remboursable: z.boolean().optional(),
  chantierId: z.number().int().nullish(),
  interventionId: z.number().int().nullish(),
  clientId: z.number().int().nullish(),
  notes: z.string().max(2000).nullish(),
  justificatifUrl: z.string().max(2000).nullish(),
  justificatifNom: z.string().max(255).nullish(),
  recurrente: z.boolean().optional(),
  frequenceRecurrence: frequenceEnum.nullish(),
  prochaineOccurrence: isoDate.nullish(),
  tvaDeductible: z.boolean().optional(),
});

// ⚠️ `numero` (numérotation maîtrisée, immuable), `userId`, `statut`/`rembourse`/
// `dateRemboursement` ABSENTS : l'identité du créateur et le numéro ne passent pas par `update`.
const updateSchema = z.object({
  dateDepense: isoDate.optional(),
  categorie: z.string().min(1).max(50).optional(),
  montantHt: decimal.optional(),
  tauxTva: decimal.nullish(),
  fournisseur: z.string().max(255).nullish(),
  sousCategorie: z.string().max(100).nullish(),
  description: z.string().max(2000).nullish(),
  modePaiement: modePaiementEnum.optional(),
  remboursable: z.boolean().optional(),
  chantierId: z.number().int().nullish(),
  interventionId: z.number().int().nullish(),
  clientId: z.number().int().nullish(),
  notes: z.string().max(2000).nullish(),
  justificatifUrl: z.string().max(2000).nullish(),
  justificatifNom: z.string().max(255).nullish(),
  recurrente: z.boolean().optional(),
  frequenceRecurrence: frequenceEnum.nullish(),
  prochaineOccurrence: isoDate.nullish(),
  tvaDeductible: z.boolean().optional(),
});

// Routeur tRPC du domaine depenses. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant + TVA dérivée + anti-IDOR-FK via ctx.tenant), laisse remonter les
// Domain errors (NotFound→404, Validation→400). Repo injecté (DI).
export function createDepensesRouter(repo: IDepenseRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listDepenses(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getDepense(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerDepense(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierDepense(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerDepense(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
