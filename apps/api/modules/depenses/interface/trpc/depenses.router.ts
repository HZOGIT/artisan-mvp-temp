import { z } from "zod";
import { router, protectedProcedure, permissionProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IDepenseRepository } from "../../application/depense-repository";
import { listDepenses, getDepense, checkDoublons, getDepensesStats } from "../../application/read-use-cases";
import { creerDepense, modifierDepense, supprimerDepense, creerIndemniteKm, convertirTrajetEnIndemnite } from "../../application/write-use-cases";
import type { IDeplacementRepository } from "../../application/deplacement-repository";
import type { TenantContext } from "../../../../shared/tenant";
/*
 * Composition : le client appelle les catégories de dépense via `trpc.depenses.getCategories/...`
 * (le legacy les expose sous le routeur `depenses`). On délègue aux use-cases du domaine
 * categories-depenses (déjà migré) — parité de surface, pas de duplication de logique.
 */
import type { ICategorieDepenseRepository } from "../../../categories-depenses/application/categorie-depense-repository";
import { listCategories } from "../../../categories-depenses/application/read-use-cases";
import { creerCategorie, modifierCategorie, supprimerCategorie } from "../../../categories-depenses/application/write-use-cases";
/** Composition : le client gère les budgets mensuels par catégorie via `trpc.depenses.setBudget` / etc. */
import type { IBudgetCategorieRepository } from "../../../budgets-categories/application/budget-categorie-repository";
import { budgetsParMois } from "../../../budgets-categories/application/read-use-cases";
import { creerBudget, modifierBudget, copierBudgetsMois } from "../../../budgets-categories/application/write-use-cases";
import { budgetsRealises } from "../../application/budgets-realises-use-case";
/** Composition : règles de catégorisation auto via `trpc.depenses.getRegles/createRegle/deleteRegle`. */
import type { IRegleCategorisationRepository } from "../../../regles-categorisation/application/regle-categorisation-repository";
import { listRegles } from "../../../regles-categorisation/application/read-use-cases";
import { creerRegle, supprimerRegle } from "../../../regles-categorisation/application/write-use-cases";
/*
 * Composition : notes de frais via `trpc.depenses.listNotesFrais/...` (workflow anti self-approbation
 * porté par le domaine notes-de-frais ; les mutations seront ajoutées en slices dédiés).
 */
import type { INoteDeFraisRepository } from "../../../notes-de-frais/application/note-de-frais-repository";
import { listNotesDeFraisAvecCompte, getNoteFraisDetail } from "../../../notes-de-frais/application/read-use-cases";
import { creerNoteDeFrais, soumettreNoteDeFrais, approuverNoteDeFrais, rejeterNoteDeFrais, payerNoteDeFrais, ajouterDepenseANote, retirerDepenseDeNote } from "../../../notes-de-frais/application/write-use-cases";
import type { ITransactionBancaireRepository } from "../../application/transaction-bancaire-repository";
import type { IFactureLettrerPort } from "../../application/facture-lettreur-port";
import { getTransactionsBancaires, ignorerTransaction, importReleve, convertirTransaction } from "../../application/transactions-use-cases";
import { getSuggestionsRapprochement, rapprocher } from "../../application/lettrage-use-cases";
import type { FecReader } from "../../application/fec-reader";
import { exportFecAchats } from "../../application/fec";
import type { VisionPort, RateLimiterPort } from "../../../../shared/ports";
import { analyserJustificatif } from "../../application/analyser-justificatif";
import type { IDepenseComptaPort } from "../../application/depense-compta-port";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const modePaiementEnum = z.enum(["carte", "especes", "virement", "cheque", "prelevement"]);
const frequenceEnum = z.enum(["mensuelle", "trimestrielle", "annuelle"]);

/*
 * Bornes alignées sur la table `depenses` (defense-in-depth). ⚠️ Le client NE fournit PAS
 * `numero` (généré côté serveur), ni `userId` (forcé au créateur), ni `montantTva`/`montantTtc`
 * (dérivés côté serveur de montantHt+tauxTva) → garde l'intégrité comptable (numérotation
 * maîtrisée + pas de TTC falsifiable).
 */
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
  coeffDeductibilite: decimal.optional(),
});

/*
 * ⚠️ `numero` (numérotation maîtrisée, immuable), `userId`, `statut`/`rembourse`/
 * `dateRemboursement` ABSENTS : l'identité du créateur et le numéro ne passent pas par `update`.
 */
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
  coeffDeductibilite: decimal.optional(),
});

/*
 * Catégories de dépense — schémas alignés sur le contrat client legacy (`trpc.depenses.*Categorie`).
 * ⚠️ `plafondMensuel` est un NUMBER côté client legacy (mappé en string décimale pour le domaine) ;
 * `couleur` accepte "" (mappé en défaut). Noms de procédures identiques au legacy (parité).
 */
const hexCouleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (#RRGGBB attendu)").or(z.literal(""));
const createCategorieSchema = z.object({
  nom: z.string().max(100),
  couleur: hexCouleur.optional(),
  icone: z.string().max(50).optional(),
  compteComptable: z.string().max(10).optional(),
  plafondMensuel: z.number().min(0).optional(),
});
const updateCategorieSchema = z.object({
  id: z.number(),
  nom: z.string().max(100).optional(),
  couleur: hexCouleur.optional(),
  icone: z.string().max(50).optional(),
  compteComptable: z.string().max(10).optional(),
  plafondMensuel: z.number().min(0).optional(),
  actif: z.boolean().optional(),
});

/*
 * Routeur tRPC du domaine depenses. Transport mince : valide les inputs (zod), délègue aux
 * use-cases (scoping tenant + TVA dérivée + anti-IDOR-FK via ctx.tenant), laisse remonter les
 * Domain errors (NotFound→404, Validation→400). Repos injectés (DI) : `repo` (dépenses) +
 * `categorieRepo` (catégories de dépense, composées sous ce routeur pour parité avec le client).
 */
export function createDepensesRouter(
  repo: IDepenseRepository,
  categorieRepo: ICategorieDepenseRepository,
  budgetRepo: IBudgetCategorieRepository,
  regleRepo: IRegleCategorisationRepository,
  noteRepo: INoteDeFraisRepository,
  transactionRepo: ITransactionBancaireRepository,
  factureLettreur: IFactureLettrerPort,
  fecReader: FecReader,
  db?: DbClient,
  ocr?: { vision: VisionPort; rateLimiter: RateLimiterPort },
  deplacementRepo?: IDeplacementRepository,
  lockDateReader?: { getLockDate(ctx: TenantContext): Promise<string | null> },
  comptaAchat?: IDepenseComptaPort,
) {
  const approuverNdf = permissionProcedure("notes_frais.approuver");
  const compta = permissionProcedure("comptabilite.voir");

  return router({
    list: protectedProcedure.query(({ ctx }) => listDepenses(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getDepense(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        const lockDate = await lockDateReader?.getLockDate(ctx.tenant) ?? null;
        const result = await withOutbox(db, repo, async (r, tx) => {
          const d = await creerDepense(r, ctx.tenant, input, lockDate);
          ctx.log.info(
            { event: "depense_creee", depenseId: d.id, montantHt: Number(input.montantHt), categorie: input.categorie, chantierId: input.chantierId ?? null, recurrente: input.recurrente ?? false },
            "Dépense enregistrée",
          );
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "depense.creee", entityType: "depense", entityId: d.id, payload: { depenseId: d.id, montant: d.montantTtc, categorieId: d.categorie } });
          return d;
        });
        if (comptaAchat) await comptaAchat.genererEcrituresAchat(ctx.tenant, result).catch((err: unknown) => {
          ctx.log.error({ err, depenseId: result.id }, "AC generation failed after depense create");
        });
        return result;
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const lockDate = await lockDateReader?.getLockDate(ctx.tenant) ?? null;
        const { id, ...data } = input;
        const result = await withOutbox(db, repo, async (r, tx) => {
          const d = await modifierDepense(r, ctx.tenant, id, data, lockDate);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "depense.modifiee", entityType: "depense", entityId: id, payload: { depenseId: id } });
          return d;
        });
        if (comptaAchat) await comptaAchat.genererEcrituresAchat(ctx.tenant, result).catch((err: unknown) => {
          ctx.log.error({ err, depenseId: result.id }, "AC generation failed after depense update");
        });
        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        let depenseNumero: string | undefined;
        const result = await withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          depenseNumero = before?.numero;
          await supprimerDepense(r, ctx.tenant, input.id);
          ctx.log.warn({ event: "depense_supprimee", depenseId: input.id }, "Dépense supprimée");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "depense.supprimee", entityType: "depense", entityId: input.id, payload: { snapshot: { depenseId: input.id, montant: before?.montantTtc ?? null } } });
          return { success: true };
        });
        if (comptaAchat && depenseNumero) {
          await comptaAchat.supprimerEcrituresAchat(ctx.tenant, depenseNumero).catch((err: unknown) => {
            ctx.log.error({ err, depenseNumero }, "AC suppression failed after depense delete");
          });
        }
        return result;
      }),

    /*
     * ── Analytics dépenses (lecture seule) ────────────────────────────────────────────
     * Doublons potentiels (aide saisie) : pas de détection si montant ≤ 0 / date invalide → [].
     */
    checkDoublons: protectedProcedure
      .input(
        z.object({
          montantTtc: z.number(),
          dateDepense: z.string().min(1),
          fournisseur: z.string().max(255).optional(),
          excludeId: z.number().int().optional(),
        }),
      )
      .query(({ ctx, input }) => checkDoublons(repo, ctx.tenant, input)),

    /** Statistiques du mois (défaut = mois courant). */
    stats: protectedProcedure
      .input(z.object({ mois: z.string().regex(/^\d{4}-\d{2}$/, "Mois invalide (AAAA-MM)").optional() }).optional())
      .query(({ ctx, input }) => getDepensesStats(repo, ctx.tenant, input?.mois)),

    /** ── Catégories de dépense (parité client : trpc.depenses.*Categorie) ────────────── */
    getCategories: protectedProcedure.query(({ ctx }) => listCategories(categorieRepo, ctx.tenant)),

    createCategorie: protectedProcedure
      .input(createCategorieSchema)
      .mutation(({ ctx, input }) =>
        creerCategorie(categorieRepo, ctx.tenant, {
          nom: input.nom,
          /** "" → défaut */
          couleur: input.couleur || undefined,
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

    /*
     * ── Budgets mensuels par catégorie (parité client : trpc.depenses.getBudgets/setBudget) ──
     * Read DÉRIVÉ : budget vs réalisé (SUM dépenses du mois) par catégorie + écart + pourcentage.
     */
    getBudgets: protectedProcedure
      .input(z.object({ mois: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)") }))
      .query(({ ctx, input }) => budgetsRealises(categorieRepo, budgetRepo, repo, ctx.tenant, input.mois)),

    /*
     * Upsert (categorie, mois) : crée si absent, sinon met à jour le montant — délègue au domaine
     * budgets-categories (contrainte UNIQUE (artisan, categorie, mois) garantie côté DB).
     */
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

    /** Copie les budgets d'un mois vers un autre (upsert par catégorie, idempotent). */
    copierBudgetsMois: protectedProcedure
      .input(
        z.object({
          moisSource: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)"),
          moisCible: z.string().regex(/^\d{4}-\d{2}$/, "Format mois attendu (YYYY-MM)"),
        }),
      )
      .mutation(({ ctx, input }) => copierBudgetsMois(budgetRepo, ctx.tenant, input.moisSource, input.moisCible)),

    /** ── Indemnité kilométrique (crée une dépense forfaitaire sans TVA) ──────────────── */
    creerIndemniteKm: protectedProcedure
      .input(
        z.object({
          dateDepense: z.string().min(1),
          kilometres: z.number().positive(),
          tarifKm: z.number().positive().default(0.529),
          motif: z.string().max(500).optional(),
          chantierId: z.number().int().nullish(),
          clientId: z.number().int().nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerIndemniteKm(r, ctx.tenant, {
            dateDepense: input.dateDepense,
            kilometres: input.kilometres,
            tarifKm: input.tarifKm,
            motif: input.motif,
            chantierId: input.chantierId ?? null,
            clientId: input.clientId ?? null,
          });
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "depense.indemnite_km_creee", entityType: "depense", entityId: result.id, payload: { depenseId: result.id, km: input.kilometres, taux: input.tarifKm } });
          return result;
        });
      }),

    /** ── Règles de catégorisation auto (parité client : trpc.depenses.getRegles/...) ──── */
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

    /*
     * ── Notes de frais (parité client : trpc.depenses.listNotesFrais/...) ──────────────
     * Read seul pour l'instant ; les mutations (create/soumettre/approuver/rejeter/payer) viendront
     * en slices dédiés en préservant l'anti self-approbation porté par le domaine notes-de-frais.
     */
    listNotesFrais: protectedProcedure.query(({ ctx }) => listNotesDeFraisAvecCompte(noteRepo, ctx.tenant)),

    /*
     * Création d'une note de frais (parité client : trpc.depenses.createNoteFrais). ⚠️ `numero`
     * est généré CÔTÉ SERVEUR (noteRepo.nextNumero) — jamais fourni par le client — et `userId`
     * est forcé au créateur dans le use-case (anti-IDOR demandeur). `depenseIds` est
     * désormais HONORÉ — cascade `addDepenseLink` (anti-IDOR : skip silencieux des dépenses hors
     * tenant / non remboursables ; recalcul du `montant_total` porté par addDepenseLink).
     */
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
        const note = await creerNoteDeFrais(noteRepo, ctx.tenant, {
          numero,
          titre: input.titre,
          periodeDebut: input.periodeDebut,
          periodeFin: input.periodeFin,
        });
        for (const depenseId of input.depenseIds ?? []) {
          await noteRepo.addDepenseLink(ctx.tenant, note.id, depenseId);
        }
        const result = (await noteRepo.getById(ctx.tenant, note.id)) ?? note;
        ctx.log.info({ event: "note_frais_creee", noteId: result.id, depenseCount: input.depenseIds?.length ?? 0 }, "Note de frais créée");
        return result;
      }),

    /*
     * Soumission d'une note de frais (parité client : trpc.depenses.soumettreNoteFrais). ⚠️ Le
     * use-case porte les invariants : transition `brouillon→soumise` uniquement (sinon Conflict→409),
     * idempotent (déjà soumise → no-op), hors tenant → NotFound→404.
     */
    soumettreNoteFrais: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await soumettreNoteDeFrais(noteRepo, ctx.tenant, input.id);
        ctx.log.info({ event: "note_frais_soumise", noteId: input.id }, "Note de frais soumise à approbation");
        return result;
      }),

    /*
     * Approbation/rejet d'une note de frais (parité client). ⚠️ INVARIANT SENSIBLE — **anti
     * self-approbation** : l'approbateur (ctx.userId) ≠ le demandeur (note.userId) → sinon 403
     * (porté par le use-case). Transition `soumise→approuvee|rejetee` (sinon 409), idempotent,
     * hors tenant → 404. `rejeterNoteFrais` exige un commentaire (motif).
     */
    approuverNoteFrais: approuverNdf
      .input(z.object({ id: z.number().int(), commentaire: z.string().max(2000).nullish() }))
      .mutation(async ({ ctx, input }) => {
        const result = await approuverNoteDeFrais(noteRepo, ctx.tenant, input.id, input.commentaire ?? undefined);
        ctx.log.info({ event: "note_frais_approuvee", noteId: input.id }, "Note de frais approuvée");
        return result;
      }),

    rejeterNoteFrais: approuverNdf
      .input(z.object({ id: z.number().int(), commentaire: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const result = await rejeterNoteDeFrais(noteRepo, ctx.tenant, input.id, input.commentaire);
        ctx.log.warn({ event: "note_frais_rejetee", noteId: input.id }, "Note de frais rejetée");
        return result;
      }),

    /*
     * Paiement d'une note de frais (parité client). Transition `approuvee→payee` + datePaiement ;
     * idempotent (déjà payee → no-op) ; 409 si non approuvée ; hors tenant → 404.
     */
    payerNoteFrais: approuverNdf
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await payerNoteDeFrais(noteRepo, ctx.tenant, input.id);
        ctx.log.info({ event: "note_frais_payee", noteId: input.id }, "Note de frais payée");
        return result;
      }),

    /*
     * ⚠️ Parité behavior-preserving : le legacy renvoie `null` si introuvable/hors tenant (PAS 404).
     * enrichi des `depenses[]` liées (détails) via `getNoteFraisDetail` (qui préserve le null).
     */
    getNoteFraisById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ ctx, input }) => getNoteFraisDetail(noteRepo, ctx.tenant, input.id)),

    /** ── Liens dépense ↔ note de frais (anti-IDOR via la note+dépense du tenant ; recalcul du total) ─ */
    addDepenseToNoteFrais: protectedProcedure
      .input(z.object({ noteId: z.number().int(), depenseId: z.number().int() }))
      .mutation(({ ctx, input }) => ajouterDepenseANote(noteRepo, ctx.tenant, input.noteId, input.depenseId)),

    removeDepenseFromNoteFrais: protectedProcedure
      .input(z.object({ noteId: z.number().int(), depenseId: z.number().int() }))
      .mutation(({ ctx, input }) => retirerDepenseDeNote(noteRepo, ctx.tenant, input.noteId, input.depenseId)),

    /** ── Transactions bancaires (lecture + ignorer ; import/conversion = slices dédiés) ───────────── */
    getTransactionsBancaires: protectedProcedure
      .input(z.object({ releveId: z.number().int() }).optional())
      .query(({ ctx, input }) => getTransactionsBancaires(transactionRepo, ctx.tenant, input?.releveId)),

    ignorerTransaction: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => ignorerTransaction(transactionRepo, ctx.tenant, input.id)),

    importReleve: compta
      .input(z.object({
        nomFichier: z.string().max(255),
        contenuCsv: z.string().max(5_000_000, "Fichier trop volumineux (max ~5 Mo)"),
        mapping: z.object({
          date:    z.string(),
          libelle: z.string(),
          montant: z.string().optional(),
          debit:   z.string().optional(),
          credit:  z.string().optional(),
        }).optional(),
      }))
      .mutation(({ ctx, input }) => importReleve({ transactionRepo, regleRepo }, ctx.tenant, input)),

    /** ⚠️ Idempotence anti double-dépense (FEC/TVA) : refuse si déjà convertie. */
    convertirTransaction: protectedProcedure
      .input(
        z.object({
          transactionId: z.number().int(),
          categorie: z.string().min(1).max(100),
          fournisseur: z.string().max(255).optional(),
          description: z.string().max(5000).optional(),
          tauxTva: z.number().min(0).max(100).optional(),
        }),
      )
      .mutation(({ ctx, input }) => convertirTransaction({ transactionRepo, depenseRepo: repo }, ctx.tenant, input)),

    /** ── Rapprochement encaissements (lettrage crédit → facture) ────────────────────────── */
    getSuggestionsRapprochement: protectedProcedure
      .query(({ ctx }) => getSuggestionsRapprochement({ transactionRepo, lettreur: factureLettreur }, ctx.tenant)),

    /** ⚠️ Idempotent : si déjà rapproché à la même facture → success immédiat. */
    rapprocher: compta
      .input(z.object({ transactionId: z.number().int(), factureId: z.number().int() }))
      .mutation(({ ctx, input }) => rapprocher({ transactionRepo, lettreur: factureLettreur }, ctx.tenant, input)),

    /** ── Export FEC achats (format AFNOR ; débit=crédit par construction) — lecture seule ────────── */
    exportFecAchats: compta
      .input(z.object({ dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ"), dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ") }))
      .mutation(({ ctx, input }) => exportFecAchats(fecReader, ctx.tenant, input.dateDebut, input.dateFin)),

    /** ── OCR justificatif (vision) — anti-IDOR depenseId + rate-limit IA ; sans seam → dégradé ────── */
    analyserJustificatif: protectedProcedure
      .input(z.object({ imageBase64: z.string().min(1), depenseId: z.number().int().optional() }))
      .mutation(({ ctx, input }) =>
        ocr
          ? analyserJustificatif({ vision: ocr.vision, rateLimiter: ocr.rateLimiter, depenseRepo: repo }, ctx.tenant, input)
          : Promise.resolve({ success: false, data: {}, error: "OCR non disponible" }),
      ),

    /** ── Trajets (historique_deplacements) : liste + conversion en indemnité kilométrique ─────────── */
    listTrajets: protectedProcedure.query(({ ctx }) =>
      deplacementRepo ? deplacementRepo.listParTenant(ctx.tenant) : Promise.resolve([]),
    ),

    /**
     * Convertit un trajet enregistré en dépense IK. Idempotent : 2e appel sur le même trajet
     * retourne la dépense existante sans doublon.
     */
    convertirTrajet: protectedProcedure
      .input(
        z.object({
          deplacementId: z.number().int(),
          tarifKm: z.number().positive().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!deplacementRepo) throw new Error("Module déplacements non configuré");
        return withOutbox(db, repo, async (r, tx) => {
          const result = await convertirTrajetEnIndemnite(r, deplacementRepo, ctx.tenant, {
            deplacementId: input.deplacementId,
            tarifKm: input.tarifKm,
          });
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "depense.trajet_converti", entityType: "depense", entityId: result.id, payload: { depenseId: result.id, deplacementId: input.deplacementId } });
          return result;
        });
      }),
  });
}
