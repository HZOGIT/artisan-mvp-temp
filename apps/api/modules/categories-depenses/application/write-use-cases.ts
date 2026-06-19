import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICategorieDepenseRepository } from "./categorie-depense-repository";
import type { CategorieDepense, CreateCategorieInput, UpdateCategorieInput } from "../domain/categorie-depense";

/*
 * Use-cases d'écriture — purs, repository injecté. Validation métier. ⚠️ L'unicité du nom
 * (artisan_id, nom) est garantie par la contrainte DB et remonte du repo sous forme de
 * `ConflictError` (on la laisse propager — formatter TRPC → 409). Le scoping tenant est porté par le repo.
 */

const HEX_COULEUR = /^#[0-9a-fA-F]{6}$/;
const DECIMAL_2 = /^\d+(\.\d{1,2})?$/;

function assertCouleur(couleur: string | undefined): void {
  if (couleur === undefined) return;
  if (!HEX_COULEUR.test(couleur)) throw new ValidationError("La couleur doit être au format hexadécimal #RRGGBB");
}

function assertPlafond(plafond: string | null | undefined): void {
  if (plafond === undefined || plafond === null) return;
  if (!DECIMAL_2.test(plafond)) throw new ValidationError("Le plafond mensuel doit être un montant positif (2 décimales max)");
}

export async function creerCategorie(
  repo: ICategorieDepenseRepository,
  ctx: TenantContext,
  input: CreateCategorieInput,
): Promise<CategorieDepense> {
  if (!input.nom?.trim()) throw new ValidationError("Le nom est requis");
  assertCouleur(input.couleur);
  assertPlafond(input.plafondMensuel);
  return repo.create(ctx, input); // ConflictError (nom déjà pris) remonte du repo
}

export async function modifierCategorie(
  repo: ICategorieDepenseRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateCategorieInput,
): Promise<CategorieDepense> {
  if (input.nom !== undefined && !input.nom.trim()) throw new ValidationError("Le nom est requis");
  assertCouleur(input.couleur);
  assertPlafond(input.plafondMensuel);
  const updated = await repo.update(ctx, id, input); // ConflictError (rename vers nom pris) remonte du repo
  if (!updated) throw new NotFoundError("Catégorie de dépense introuvable");
  return updated;
}

export async function supprimerCategorie(repo: ICategorieDepenseRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Catégorie de dépense introuvable");
}
