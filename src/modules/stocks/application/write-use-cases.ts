import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository } from "./stock-repository";
import type { Stock, CreateStockInput, UpdateStockInput } from "../domain/stock";

// Use-cases d'écriture — purs, repository injecté. ⚠️ Domaine sensible : la quantité n'est
// jamais modifiée ici (ni create au-delà de l'init, ni update) — seul un mouvement tracé
// l'ajuste (étape ultérieure). `modifierStock` ne touche que les métadonnées.

export async function creerStock(repo: IStockRepository, ctx: TenantContext, input: CreateStockInput): Promise<Stock> {
  if (!input.reference?.trim()) throw new ValidationError("Référence requise");
  if (!input.designation?.trim()) throw new ValidationError("Désignation requise");
  if (input.quantiteEnStock != null && Number(input.quantiteEnStock) < 0) throw new ValidationError("Quantité invalide");
  if (input.seuilAlerte != null && Number(input.seuilAlerte) < 0) throw new ValidationError("Seuil d'alerte invalide");
  return repo.create(ctx, input);
}

export async function modifierStock(
  repo: IStockRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateStockInput,
): Promise<Stock> {
  if (input.reference !== undefined && !input.reference.trim()) throw new ValidationError("Référence requise");
  if (input.designation !== undefined && !input.designation.trim()) throw new ValidationError("Désignation requise");
  if (input.seuilAlerte != null && Number(input.seuilAlerte) < 0) throw new ValidationError("Seuil d'alerte invalide");
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Stock introuvable");
  return updated;
}

export async function supprimerStock(repo: IStockRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Stock introuvable");
}
