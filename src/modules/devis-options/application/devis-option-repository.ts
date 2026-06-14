import type { TenantContext } from "../../../shared/tenant";
import type { CreateDevisOptionInput, DevisOption } from "../domain/devis-option";

// Port du repository « options de devis » (variantes). Les tables `devis_options`/`devis_options_lignes`
// n'ont PAS de colonne tenant → l'anti-IDOR est porté par l'appartenance du DEVIS parent (RLS + filtre
// artisanId), vérifiée DANS chaque méthode. Le sentinel `null`/`false` (devis/option non possédé) est
// traduit en NotFoundError par le use-case (parité legacy `assertDevisOwner`/`assertOptionOwner`).
export interface IDevisOptionRepository {
  // Options d'un devis possédé, triées par `ordre`. `null` si le devis n'appartient pas au tenant.
  listByDevis(ctx: TenantContext, devisId: number): Promise<DevisOption[] | null>;
  // Crée une option sous un devis possédé. `null` si le devis n'appartient pas au tenant.
  create(ctx: TenantContext, input: CreateDevisOptionInput): Promise<DevisOption | null>;
  // Supprime une option (cascade ses lignes). `false` si l'option/devis n'appartient pas au tenant.
  remove(ctx: TenantContext, optionId: number): Promise<boolean>;
  // Marque l'option « sélectionnée » (et désélectionne les autres du même devis). `null` si non possédée.
  select(ctx: TenantContext, optionId: number): Promise<DevisOption | null>;
  // Convertit l'option en lignes officielles du devis parent (remplace ses lignes + totaux, marque
  // l'option sélectionnée). `false` si l'option/devis n'appartient pas au tenant.
  convertirEnDevis(ctx: TenantContext, optionId: number): Promise<boolean>;
}
