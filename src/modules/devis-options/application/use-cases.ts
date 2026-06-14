import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisOptionRepository } from "./devis-option-repository";
import type { CreateDevisOptionInput, DevisOption } from "../domain/devis-option";

// Use-cases minces des options de devis : transport + traduction du sentinel d'appartenance en
// NotFoundError (parité legacy : `assertDevisOwner` → 404 « Devis non trouvé », `assertOptionOwner`
// → 404 « Option non trouvée »). L'anti-IDOR réel (appartenance du devis parent) est appliqué dans
// le repository, jamais ici.

export async function listOptions(repo: IDevisOptionRepository, ctx: TenantContext, devisId: number): Promise<DevisOption[]> {
  const options = await repo.listByDevis(ctx, devisId);
  if (options === null) throw new NotFoundError("Devis non trouvé");
  return options;
}

export async function creerOption(repo: IDevisOptionRepository, ctx: TenantContext, input: CreateDevisOptionInput): Promise<DevisOption> {
  const option = await repo.create(ctx, input);
  if (!option) throw new NotFoundError("Devis non trouvé");
  return option;
}

export async function supprimerOption(repo: IDevisOptionRepository, ctx: TenantContext, optionId: number): Promise<{ success: true }> {
  if (!(await repo.remove(ctx, optionId))) throw new NotFoundError("Option non trouvée");
  return { success: true };
}

export async function selectionnerOption(repo: IDevisOptionRepository, ctx: TenantContext, optionId: number): Promise<DevisOption> {
  const option = await repo.select(ctx, optionId);
  if (!option) throw new NotFoundError("Option non trouvée");
  return option;
}

export async function convertirOptionEnDevis(repo: IDevisOptionRepository, ctx: TenantContext, optionId: number): Promise<{ success: true }> {
  if (!(await repo.convertirEnDevis(ctx, optionId))) throw new NotFoundError("Option non trouvée");
  return { success: true };
}
