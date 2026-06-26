import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { RegleCategorisation, CreateRegleInput, UpdateRegleInput } from "../domain/regle-categorisation";

/*
 * Port du repository regles-categorisation (catalogue artisan). Chaque méthode exige le TenantContext
 * (scope tenant + RLS). `regles_categorisation` possède un `artisan_id` → double cloisonnement RLS +
 * filtre. Pas de contrainte d'unicité (plusieurs règles peuvent partager motif/catégorie).
 */
export interface IRegleCategorisationRepository {
  list(ctx: TenantContext): Promise<RegleCategorisation[]>;
  /** null si la règle n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<RegleCategorisation | null>;
  create(ctx: TenantContext, input: CreateRegleInput): Promise<RegleCategorisation>;
  /** null si la règle n'appartient pas au tenant. */
  update(ctx: TenantContext, id: number, input: UpdateRegleInput): Promise<RegleCategorisation | null>;
  /** false si la règle n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  withDb(db: DbClient): IRegleCategorisationRepository;
}
