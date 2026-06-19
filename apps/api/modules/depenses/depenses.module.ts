import type { IDepenseRepository } from "./application/depense-repository";
import type { ICategorieDepenseRepository } from "../categories-depenses/application/categorie-depense-repository";
import type { IBudgetCategorieRepository } from "../budgets-categories/application/budget-categorie-repository";
import type { IRegleCategorisationRepository } from "../regles-categorisation/application/regle-categorisation-repository";
import type { INoteDeFraisRepository } from "../notes-de-frais/application/note-de-frais-repository";
import type { ITransactionBancaireRepository } from "./application/transaction-bancaire-repository";
import type { FecReader } from "./application/fec-reader";
import type { VisionPort, RateLimiterPort } from "../../shared/ports";
import { createDepensesRouter } from "./interface/trpc/depenses.router";

/*
 * Wiring DI du module depenses : assemble le routeur tRPC à partir des repositories injectés.
 * `categorieRepository`/`budgetRepository` : le client appelle catégories et budgets de dépense via
 * `trpc.depenses.*Categorie` / `trpc.depenses.setBudget` (parité legacy) → composés dans ce routeur en
 * déléguant aux domaines categories-depenses / budgets-categories.
 */
export interface DepensesModuleDeps {
  readonly repository: IDepenseRepository;
  readonly categorieRepository: ICategorieDepenseRepository;
  readonly budgetRepository: IBudgetCategorieRepository;
  readonly regleRepository: IRegleCategorisationRepository;
  readonly noteRepository: INoteDeFraisRepository;
  readonly transactionRepository: ITransactionBancaireRepository;
  readonly fecReader: FecReader;
  /*
   * Seam OCR (analyserJustificatif) : modèle vision + rate-limiter IA. Optionnel : sans lui, la
   * procédure renvoie une dégradation `{success:false}`.
   */
  readonly ocr?: { readonly vision: VisionPort; readonly rateLimiter: RateLimiterPort };
}

export interface DepensesModule {
  readonly deps: DepensesModuleDeps;
  readonly router: ReturnType<typeof createDepensesRouter>;
}

export function createDepensesModule(deps: DepensesModuleDeps): DepensesModule {
  return {
    deps,
    router: createDepensesRouter(
      deps.repository,
      deps.categorieRepository,
      deps.budgetRepository,
      deps.regleRepository,
      deps.noteRepository,
      deps.transactionRepository,
      deps.fecReader,
      deps.ocr,
    ),
  };
}
