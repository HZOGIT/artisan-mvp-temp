import type { DbClient } from "../../shared/db";
import type { TenantContext } from "../../shared/tenant";
import type { IDepenseRepository } from "./application/depense-repository";
import type { ICategorieDepenseRepository } from "../categories-depenses/application/categorie-depense-repository";
import type { IBudgetCategorieRepository } from "../budgets-categories/application/budget-categorie-repository";
import type { IRegleCategorisationRepository } from "../regles-categorisation/application/regle-categorisation-repository";
import type { INoteDeFraisRepository } from "../notes-de-frais/application/note-de-frais-repository";
import type { ITransactionBancaireRepository } from "./application/transaction-bancaire-repository";
import type { IFactureLettrerPort } from "./application/facture-lettreur-port";
import type { FecReader } from "./application/fec-reader";
import type { VisionPort, RateLimiterPort } from "../../shared/ports";
import type { IDeplacementRepository } from "./application/deplacement-repository";
import type { IDepenseComptaPort } from "./application/depense-compta-port";
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
  readonly factureLettreur: IFactureLettrerPort;
  readonly fecReader: FecReader;
  readonly db?: DbClient;
  /*
   * Seam OCR (analyserJustificatif) : modèle vision + rate-limiter IA. Optionnel : sans lui, la
   * procédure renvoie une dégradation `{success:false}`.
   */
  readonly ocr?: { readonly vision: VisionPort; readonly rateLimiter: RateLimiterPort };
  readonly deplacementRepository?: IDeplacementRepository;
  /** Lecteur de date de verrouillage comptable (garde anti-création/modif en période close). */
  readonly lockDateReader?: { getLockDate(ctx: TenantContext): Promise<string | null> };
  /** Seam comptable : génère/supprime les écritures AC dans ecritures_comptables (optionnel). */
  readonly comptaAchat?: IDepenseComptaPort;
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
      deps.factureLettreur,
      deps.fecReader,
      deps.db,
      deps.ocr,
      deps.deplacementRepository,
      deps.lockDateReader,
      deps.comptaAchat,
    ),
  };
}
