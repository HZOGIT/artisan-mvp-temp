import { ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IConfigRelancesRepository } from "./config-relances-repository";
import type { ConfigRelancesAuto, UpdateConfigRelancesInput } from "../domain/config-relances";

/*
 * Use-case d'écriture — pur, repository injecté. Valide la config avant `upsert` (singleton).
 * Le scoping tenant est porté par le repo.
 * 
 * ⚠️ `modeleEmailId` : réf. lâche vers `modeles_email` (pas de FK au schéma). L'ownership (que le
 * modèle appartienne au tenant) n'est PAS vérifié ici — à durcir via un IModeleEmailReader quand le
 * besoin se concrétise (finding tracé dans le projet « Refonte — findings & dette repérés »).
 */

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertEntierMin(valeur: number | undefined, min: number, libelle: string): void {
  if (valeur === undefined) return;
  if (!Number.isInteger(valeur) || valeur < min) throw new ValidationError(`${libelle} doit être un entier ≥ ${min}`);
}

function assertEntierBorne(valeur: number | undefined, min: number, max: number, libelle: string): void {
  if (valeur === undefined) return;
  if (!Number.isInteger(valeur) || valeur < min || valeur > max) {
    throw new ValidationError(`${libelle} doit être un entier entre ${min} et ${max}`);
  }
}

// Valide une liste de jours de la semaine "1,2,3" (entiers 1..7, non vide).
function assertJoursEnvoi(valeur: string | undefined): void {
  if (valeur === undefined) return;
  const tokens = valeur.split(",").map((t) => t.trim());
  if (tokens.length === 0 || tokens.some((t) => t === "")) {
    throw new ValidationError("Les jours d'envoi doivent être une liste non vide de jours (1..7)");
  }
  for (const t of tokens) {
    const n = Number(t);
    if (!Number.isInteger(n) || n < 1 || n > 7) {
      throw new ValidationError("Les jours d'envoi doivent être des entiers entre 1 et 7");
    }
  }
}

export async function mettreAJourConfigRelances(
  repo: IConfigRelancesRepository,
  ctx: TenantContext,
  input: UpdateConfigRelancesInput,
): Promise<ConfigRelancesAuto> {
  assertEntierMin(input.joursApresEnvoi, 1, "Le délai après envoi (jours)");
  assertEntierMin(input.joursEntreRelances, 1, "Le délai entre relances (jours)");
  assertEntierBorne(input.nombreMaxRelances, 1, 10, "Le nombre maximum de relances");
  if (input.heureEnvoi !== undefined && !HEURE.test(input.heureEnvoi)) {
    throw new ValidationError("L'heure d'envoi doit être au format HH:MM (00:00–23:59)");
  }
  assertJoursEnvoi(input.joursEnvoi);
  if (input.modeleEmailId !== undefined && input.modeleEmailId !== null) {
    if (!Number.isInteger(input.modeleEmailId) || input.modeleEmailId < 1) {
      throw new ValidationError("Le modèle d'email référencé est invalide");
    }
  }
  return repo.upsert(ctx, input);
}
