import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IPrevisionCARepository } from "./prevision-ca-repository";
import type { CreatePrevisionInput, PrevisionCA, UpdatePrevisionInput } from "../domain/prevision-ca";

/*
 * Use-cases d'écriture — purs, repository injecté. Validation métier. Pas de contrainte d'unicité sur
 * ce domaine. `ecart`/`ecartPourcentage` restent des champs libres validés (pas de recalcul serveur
 * imposé — le legacy les fournit déjà calculés). Le scoping tenant est porté par le repo.
 */

const DECIMAL_POSITIF = /^\d+(\.\d{1,2})?$/; // montant ≥ 0, 2 décimales max
const DECIMAL_SIGNE = /^-?\d+(\.\d{1,2})?$/; // écart pouvant être négatif

function assertMontantPositif(valeur: string | undefined, label: string): void {
  if (valeur === undefined) return;
  if (!DECIMAL_POSITIF.test(valeur)) throw new ValidationError(`Le ${label} doit être un montant positif (2 décimales max)`);
}

function assertMontantSigne(valeur: string | undefined, label: string): void {
  if (valeur === undefined) return;
  if (!DECIMAL_SIGNE.test(valeur)) throw new ValidationError(`Le ${label} doit être un nombre décimal (2 décimales max)`);
}

function assertConfiance(valeur: string | null | undefined): void {
  if (valeur === undefined || valeur === null) return;
  if (!DECIMAL_POSITIF.test(valeur) || Number(valeur) > 100) {
    throw new ValidationError("La confiance doit être un pourcentage entre 0 et 100");
  }
}

function assertMontants(input: CreatePrevisionInput | UpdatePrevisionInput): void {
  assertMontantPositif(input.caPrevisionnel, "CA prévisionnel");
  assertMontantPositif(input.caRealise, "CA réalisé");
  assertMontantSigne(input.ecart, "écart");
  assertMontantSigne(input.ecartPourcentage, "écart en pourcentage");
  assertConfiance(input.confiance);
}

export async function creerPrevision(
  repo: IPrevisionCARepository,
  ctx: TenantContext,
  input: CreatePrevisionInput,
): Promise<PrevisionCA> {
  if (!Number.isInteger(input.mois) || input.mois < 1 || input.mois > 12) {
    throw new ValidationError("Le mois doit être un entier entre 1 et 12");
  }
  if (!Number.isInteger(input.annee) || input.annee < 2000 || input.annee > 2100) {
    throw new ValidationError("L'année doit être un entier plausible (2000-2100)");
  }
  assertMontants(input);
  return repo.create(ctx, input);
}

export async function modifierPrevision(
  repo: IPrevisionCARepository,
  ctx: TenantContext,
  id: number,
  input: UpdatePrevisionInput,
): Promise<PrevisionCA> {
  assertMontants(input);
  const updated = await repo.update(ctx, id, input); // montants/méthode/confiance seuls (mois/annee immuables)
  if (!updated) throw new NotFoundError("Prévision de CA introuvable");
  return updated;
}

export async function supprimerPrevision(repo: IPrevisionCARepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Prévision de CA introuvable");
}
