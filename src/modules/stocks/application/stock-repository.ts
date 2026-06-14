import type { TenantContext } from "../../../shared/tenant";
import type {
  Stock,
  CreateStockInput,
  UpdateStockInput,
  AdjustStockInput,
  MouvementStock,
  StockEntrant,
} from "../domain/stock";

// Résultat d'un ajustement de quantité (mouvement tracé). `not_found` = stock hors tenant ;
// `insufficient_stock` = une `sortie` rendrait la quantité physique négative (refusée, le
// stock ne peut pas être négatif). `disponible` = quantité avant le mouvement.
export type AdjustStockResult =
  | { readonly status: "ok"; readonly stock: Stock }
  | { readonly status: "not_found" }
  | { readonly status: "insufficient_stock"; readonly disponible: string };

// Port du repository stocks. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `stocks` possède un `artisanId` → double cloisonnement RLS + filtre. Les `mouvements_stock`
// (SANS artisanId) sont scopés via le stock parent. ⚠️ Domaine sensible : la quantité n'est
// jamais modifiée par `update` (métadonnées) — seul `adjustQuantity` (mouvement tracé) l'ajuste.
export interface IStockRepository {
  list(ctx: TenantContext): Promise<Stock[]>;
  getById(ctx: TenantContext, id: number): Promise<Stock | null>;
  create(ctx: TenantContext, input: CreateStockInput): Promise<Stock>;
  // null si le stock n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateStockInput): Promise<Stock | null>;
  // false si le stock n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // Ajuste la quantité via un mouvement tracé (insert mouvement + maj quantité, ATOMIQUE).
  adjustQuantity(ctx: TenantContext, stockId: number, input: AdjustStockInput): Promise<AdjustStockResult>;
  // Historique des mouvements d'un stock (récents d'abord). null si le stock n'appartient
  // pas au tenant (scope via le stock parent — `mouvements_stock` n'a pas d'artisanId).
  listMouvements(ctx: TenantContext, stockId: number): Promise<MouvementStock[] | null>;
  // Stocks du tenant sous le seuil d'alerte (`quantiteEnStock <= seuilAlerte`). Inclut les
  // ruptures. Parité legacy `getLowStockItems`.
  listLowStock(ctx: TenantContext): Promise<Stock[]>;
  // Stocks du tenant en rupture stricte (`quantiteEnStock <= 0`, épuisés). Sous-ensemble de
  // `listLowStock`. (Le legacy conflait les deux ; on distingue ici, plus correct sémantiquement.)
  listEnRupture(ctx: TenantContext): Promise<Stock[]>;
  // Quantités EN COMMANDE (non encore reçues) par stock : pour chaque `stockId` lié à une ligne de
  // commande fournisseur non soldée (statut envoyee/confirmee/partiellement_livree), somme des
  // `quantite - quantiteRecue` restant à recevoir. Scopé tenant (commandes du tenant). Parité
  // legacy `getStockEntrantByArtisan`. N'inclut que les `stockId` avec un entrant strictement > 0.
  listEntrant(ctx: TenantContext): Promise<StockEntrant[]>;
}
