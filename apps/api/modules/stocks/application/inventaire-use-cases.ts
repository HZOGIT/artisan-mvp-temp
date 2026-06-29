import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IStockRepository } from "./stock-repository";
import type { DemarrerInventaireInput, InventaireAvecLignes, ValiderInventaireResult } from "../domain/stock";

export async function demarrerInventaire(
  repo: IStockRepository,
  ctx: TenantContext,
  input: DemarrerInventaireInput,
): Promise<InventaireAvecLignes> {
  const stocks = await repo.list(ctx);
  if (stocks.length === 0) throw new ValidationError("Aucun article en stock à inventorier");
  return repo.demarrerInventaire(ctx, input);
}

export async function saisirComptage(
  repo: IStockRepository,
  ctx: TenantContext,
  ligneId: number,
  quantiteReelle: string,
): Promise<InventaireAvecLignes> {
  if (Number(quantiteReelle) < 0) throw new ValidationError("Quantité réelle invalide");
  const result = await repo.saisirComptage(ctx, ligneId, quantiteReelle);
  if (!result) throw new NotFoundError("Ligne d'inventaire introuvable");
  return result;
}

export async function validerInventaire(
  repo: IStockRepository,
  ctx: TenantContext,
  id: number,
): Promise<ValiderInventaireResult> {
  const before = await repo.getInventaire(ctx, id);
  if (!before) throw new NotFoundError("Inventaire introuvable");
  if (before.inventaire.statut === "valide") throw new ValidationError("Inventaire déjà validé");

  const result = await repo.validerInventaire(ctx, id);
  if (!result) throw new NotFoundError("Inventaire introuvable");

  const ajustementsCreees = result.lignes.filter((l) => l.ecart !== null && Number(l.ecart) !== 0).length;
  const valeurEcart = Number(result.inventaire.valeurEcart ?? "0");
  return { inventaire: result.inventaire, ajustementsCreees, valeurEcart };
}

export async function getInventaire(
  repo: IStockRepository,
  ctx: TenantContext,
  id: number,
): Promise<InventaireAvecLignes> {
  const result = await repo.getInventaire(ctx, id);
  if (!result) throw new NotFoundError("Inventaire introuvable");
  return result;
}
