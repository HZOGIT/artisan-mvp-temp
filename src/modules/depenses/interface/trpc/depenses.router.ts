import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDepenseRepository } from "../../application/depense-repository";
import { listDepenses, getDepense } from "../../application/read-use-cases";
import { creerDepense, modifierDepense, supprimerDepense } from "../../application/write-use-cases";
// Composition : le client appelle les catégories de dépense via `trpc.depenses.getCategories/...`
// (le legacy les expose sous le routeur `depenses`). On délègue aux use-cases du domaine
// categories-depenses (déjà migré) — parité de surface, pas de duplication de logique.
import type { ICategorieDepenseRepository } from "../../../categories-depenses/application/categorie-depense-repository";
import { listCategories } from "../../../categories-depenses/application/read-use-cases";
import { creerCategorie, modifierCategorie, supprimerCategorie } from "../../../categories-depenses/application/write-use-cases";
// Composition : le client gère les budgets mensuels par catégorie via `trpc.depenses.setBudget` / etc.
import type { IBudgetCategorieRepository } from "../../../budgets-categories/application/budget-categorie-repository";
import { budgetsParMois } from "../../../budgets-categories/application/read-use-cases";
import { creerBudget, modifierBudget } from "../../../budgets-categories/application/write-use-cases";
import { budgetsRealises } from "../../application/budgets-realises-use-case";
// Composition : règles de catégorisation auto via `trpc.depenses.getRegles/createRegle/deleteRegle`.
import type { IRegleCategorisationRepository } from "../../../regles-categorisation/application/regle-categorisation-repository";
import { listRegles } from "../../../regles-categorisation/application/read-use-cases";
import { creerRegle, supprimerRegle } from "../../../regles-categorisation/application/write-use-cases";
// Composition : notes de frais via `trpc.depenses.listNotesFrais/...` (workflow anti self-approbation
// porté par le domaine notes-de-frais ; les mutations seront ajoutées en slices dédiés).
import type { INoteDeFraisRepository } from "../../../notes-de-frais/application/note-de-frais-repository";
import { listNotesDeFrais } from "../../../notes-de-frais/application/read-use-cases";
import { creerNoteDeFrais } from "../../../notes-de-frais/application/write-use-cases";

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

// Catégories de dépense — schémas alignés sur le contrat client legacy (`trpc.depenses.*Categorie`).
// ⚠️ `plafondMensuel` est un NUMBER côté client legacy (mappé en string décimale pour le domaine) ;
// `couleur` accepte "" (mappé en défaut). Noms de procédures identiques au legacy (parité).
const hexCouleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal(""));
const createCategorieSchema = z.object({
  nom: z.string().max(100),
  couleur: hexCouleur.optional(),
  icone: z.string().max(50).optional(),
  compteComptable: z.string().max(10).optional(),
  plafondMensuel: z.number().optional(),
});
const updateCategorieSchema = z.object({
  id: z.number(),
  nom: z.string().max(100).optional(),
  couleur: hexCouleur.optional(),
  icone: z.string().max(50).optional(),
  compteComptable: z.string().max(10).optional(),
  plafondMensuel: z.number().optional(),
  actif: z.boolean().optional(),
});

// Routeur tRPC du domaine depenses. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant + TVA dérivée + anti-IDOR-FK via ctx.tenant), laisse remonter les
// Domain errors (NotFound→404, Validation→400). Repos injectés (DI) : `repo` (dépenses) +
// `categorieRepo` (catégories de dépense, composées sous ce routeur pour parité avec le client).
export function createDepensesRouter(
  repo: IDepenseRepository,
  categorieRepo: ICategorieDepenseRepository,
  budgetRepo: IBudgetCategorieRepository,
  regleRepo: IRegleCategorisationRepository,
  noteRepo: INoteDeFraisRepository,
) {
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

    // ── Catégories de dépense (parité client : trpc.depenses.*Categorie) ──────────────
    getCategories: protectedProcedure.query(({ ctx }) => listCategories(categorieRepo, ctx.tenant)),

    createCategorie: protectedProcedure
      .input(createCategorieSchema)
      .mutation(({ ctx, input }) =>
        creerCategorie(categorieRepo, ctx.tenant, {
          nom: input.nom,
          couleur: input.couleur || undefined, // "" → défaut
          icone: input.icone,
          compteComptable: input.compteComptable,
          plafondMensuel: input.plafondMensuel !== undefined ? String(input.plafondMensuel) : undefined,
        }),
      ),

    updateCategorie: protectedProcedure
      .input(updateCategorieSchema)
      .mutation(async ({ ctx, input }) => {
        const { id, couleur, plafondMensuel, ...rest } = input;
        await modifierCategorie(categorieRepo, ctx.tenant, id, {
          ...rest,
          ...(couleur !== undefined ? { couleur: couleur || undefined } : {}),
          ...(plafondMensuel !== undefined ? { plafondMensuel: String(plafondMensuel) } : {}),
        });
        return { success: true };
      }),

    deleteCategorie: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerCategorie(categorieRepo, ctx.tenant, input.id);
        return { success: true };
      }),

    // ── Budgets mensuels par catégorie (parité client : trpc.depenses.getBudgets/setBudget) ──
    // Read DÉRIVÉ : budget vs réalisé (SUM dépenses du mois) par catégorie + écart + pourcentage.
    getBudgets: protectedProcedure
      .input(z.object({ mois: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)") }))
      .query(({ ctx, input }) => budgetsRealises(categorieRepo, budgetRepo, repo, ctx.tenant, input.mois)),

    // Upsert (categorie, mois) : crée si absent, sinon met à jour le montant — délègue au domaine
    // budgets-categories (contrainte UNIQUE (artisan, categorie, mois) garantie côté DB).
    setBudget: protectedProcedure
      .input(
        z.object({
          categorie: z.string().max(100),
          mois: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)"),
          budget: z.number(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const montant = String(input.budget);
        const existant = (await budgetsParMois(budgetRepo, ctx.tenant, input.mois)).find((b) => b.categorie === input.categorie);
        if (existant) await modifierBudget(budgetRepo, ctx.tenant, existant.id, { budget: montant });
        else await creerBudget(budgetRepo, ctx.tenant, { categorie: input.categorie, mois: input.mois, budget: montant });
        return { success: true };
      }),

    // ── Règles de catégorisation auto (parité client : trpc.depenses.getRegles/...) ────
    getRegles: protectedProcedure.query(({ ctx }) => listRegles(regleRepo, ctx.tenant)),

    createRegle: protectedProcedure
      .input(z.object({ motifLibelle: z.string().max(255), categorie: z.string().max(50) }))
      .mutation(async ({ ctx, input }) => {
        await creerRegle(regleRepo, ctx.tenant, { motifLibelle: input.motifLibelle, categorie: input.categorie });
        return { success: true };
      }),

    deleteRegle: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerRegle(regleRepo, ctx.tenant, input.id);
        return { success: true };
      }),

    // ── Notes de frais (parité client : trpc.depenses.listNotesFrais/...) ──────────────
    // Read seul pour l'instant ; les mutations (create/soumettre/approuver/rejeter/payer) viendront
    // en slices dédiés en préservant l'anti self-approbation porté par le domaine notes-de-frais.
    listNotesFrais: protectedProcedure.query(({ ctx }) => listNotesDeFrais(noteRepo, ctx.tenant)),

    // Création d'une note de frais (parité client : trpc.depenses.createNoteFrais). ⚠️ `numero`
    // est généré CÔTÉ SERVEUR (noteRepo.nextNumero) — jamais fourni par le client — et `userId`
    // est forcé au créateur dans le use-case (anti-IDOR demandeur). `depenseIds` est accepté mais
    // ignoré pour l'instant : la cascade dépenses↔note (marquage des lignes) sort de ce slice et
    // sera ajoutée avec addDepenseToNoteFrais/removeDepenseFromNoteFrais.
    createNoteFrais: protectedProcedure
      .input(
        z.object({
          titre: z.string().min(1).max(255),
          periodeDebut: isoDate,
          periodeFin: isoDate,
          depenseIds: z.array(z.number().int()).max(1000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const numero = await noteRepo.nextNumero(ctx.tenant);
        return creerNoteDeFrais(noteRepo, ctx.tenant, {
          numero,
          titre: input.titre,
          periodeDebut: input.periodeDebut,
          periodeFin: input.periodeFin,
        });
      }),

    // ⚠️ Parité behavior-preserving : le legacy renvoie `null` si introuvable/hors tenant (PAS 404).
    // On appelle donc directement le repo (getById → null) plutôt que le use-case `getNoteDeFrais`
    // (qui lève NotFound → 404).
    getNoteFraisById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ ctx, input }) => noteRepo.getById(ctx.tenant, input.id)),
  });
}
