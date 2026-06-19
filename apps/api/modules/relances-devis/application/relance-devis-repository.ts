import type { TenantContext } from "../../../shared/tenant";
import type { CreateRelanceInput, RelanceDevis } from "../domain/relance-devis";

/*
 * Port du repository relances-devis (journal append-only). Chaque méthode exige le TenantContext
 * (scope tenant + RLS). `relances_devis` possède un `artisanId` → double cloisonnement RLS + filtre.
 * `devisId` est validé via `ownsDevis` (anti-IDOR-FK). Pas de méthode `update` : une relance est
 * immuable.
 */
export interface IRelanceDevisRepository {
  list(ctx: TenantContext): Promise<RelanceDevis[]>;
  // Historique des relances d'un devis (scopé tenant ; [] si aucune).
  listByDevis(ctx: TenantContext, devisId: number): Promise<RelanceDevis[]>;
  // null si la relance n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<RelanceDevis | null>;
  create(ctx: TenantContext, input: CreateRelanceInput): Promise<RelanceDevis>;
  // false si la relance n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // Le devis appartient-il au tenant ? (anti-IDOR-FK)
  ownsDevis(ctx: TenantContext, devisId: number): Promise<boolean>;
}
