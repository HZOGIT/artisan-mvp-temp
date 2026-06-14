import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IModeleDevisRepository } from "./modele-devis-repository";
import type { CreateModeleDevisInput, CreateModeleDevisLigneInput, ModeleDevis, UpdateModeleDevisInput } from "../domain/modele-devis";

// Use-cases d'écriture — purs, repository injecté. Validation métier (en-tête + lignes) + ⚠️
// INVARIANT « un seul modèle isDefault par artisan » (sans dimension type, ≠ modeles-email). Le
// scoping tenant est porté par le repo.

function assertMontantPositif(valeur: string | undefined, libelle: string): void {
  if (valeur === undefined) return;
  const n = Number(valeur);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${libelle} doit être un nombre positif ou nul`);
}

function assertPourcentage(valeur: string | undefined, libelle: string): void {
  if (valeur === undefined) return;
  const n = Number(valeur);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError(`${libelle} doit être compris entre 0 et 100`);
}

function assertLigne(l: CreateModeleDevisLigneInput): void {
  if (!l.designation?.trim()) throw new ValidationError("La désignation de ligne est requise");
  assertMontantPositif(l.quantite, "La quantité");
  assertMontantPositif(l.prixUnitaireHT, "Le prix unitaire HT");
  assertPourcentage(l.tauxTVA, "Le taux de TVA");
  assertPourcentage(l.remise, "La remise");
}

function assertLignes(lignes: readonly CreateModeleDevisLigneInput[] | undefined): void {
  if (lignes === undefined) return;
  for (const l of lignes) assertLigne(l);
}

// Retombe (isDefault=false) tous les modèles du tenant SAUF `exclureId`, afin de garantir au plus un
// défaut par artisan. ⚠️ On ne passe QUE `{isDefault:false}` à l'update (jamais `lignes`) pour ne pas
// remplacer/effacer les lignes des autres modèles.
async function retomberAutresDefauts(repo: IModeleDevisRepository, ctx: TenantContext, exclureId: number): Promise<void> {
  const tous = await repo.list(ctx);
  for (const m of tous) {
    if (m.id !== exclureId && m.isDefault) {
      await repo.update(ctx, m.id, { isDefault: false });
    }
  }
}

export async function creerModeleDevis(
  repo: IModeleDevisRepository,
  ctx: TenantContext,
  input: CreateModeleDevisInput,
): Promise<ModeleDevis> {
  if (!input.nom?.trim()) throw new ValidationError("Le nom est requis");
  assertLignes(input.lignes);
  const created = await repo.create(ctx, input);
  if (created.isDefault) await retomberAutresDefauts(repo, ctx, created.id);
  return created;
}

export async function modifierModeleDevis(
  repo: IModeleDevisRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateModeleDevisInput,
): Promise<ModeleDevis> {
  if (input.nom !== undefined && !input.nom.trim()) throw new ValidationError("Le nom est requis");
  assertLignes(input.lignes);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Modèle de devis introuvable");
  if (updated.isDefault) await retomberAutresDefauts(repo, ctx, updated.id);
  return updated;
}

export async function supprimerModeleDevis(repo: IModeleDevisRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Modèle de devis introuvable");
}
