import type { TenantContext } from "../../../shared/tenant";
import type { Stock, CreateStockInput, UpdateStockInput } from "../domain/stock";

// Port du repository stocks. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `stocks` possède un `artisanId` → double cloisonnement RLS + filtre. Les `mouvements_stock`
// (SANS artisanId) sont scopés via le stock. ⚠️ Domaine sensible : la quantité n'est jamais
// modifiée par `update` (métadonnées) — seul un mouvement tracé l'ajuste (étape ultérieure).
export interface IStockRepository {
  list(ctx: TenantContext): Promise<Stock[]>;
  getById(ctx: TenantContext, id: number): Promise<Stock | null>;
  create(ctx: TenantContext, input: CreateStockInput): Promise<Stock>;
  // null si le stock n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateStockInput): Promise<Stock | null>;
  // false si le stock n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
}
