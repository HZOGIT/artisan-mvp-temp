import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { INoteDeFraisRepository } from "./note-de-frais-repository";
import type { NoteDeFrais, CreateNoteDeFraisInput, UpdateNoteDeFraisInput } from "../domain/note-de-frais";

// Use-cases d'écriture — purs, repository injecté. ⚠️ **Le demandeur est TOUJOURS l'utilisateur
// courant** (`userId = ctx.userId`) — parité legacy `createNoteFrais` (`userId: ctx.user.id`) :
// on ne crée une note que pour soi-même, donc pas d'IDOR possible sur le demandeur. Le workflow
// d'approbation (statut/montant remboursé) est porté séparément.

// Dates ISO `YYYY-MM-DD` → comparaison lexicographique = chronologique.
function assertPeriodeCoherente(debut?: string, fin?: string): void {
  if (debut && fin && fin < debut) {
    throw new ValidationError("La fin de période doit être postérieure ou égale au début");
  }
}

function assertMontant(valeur: string | undefined, libelle: string): void {
  if (valeur != null && valeur !== "" && Number(valeur) < 0) {
    throw new ValidationError(`${libelle} invalide`);
  }
}

export async function creerNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  // L'appelant ne fournit JAMAIS `userId` : il est forcé à l'utilisateur courant.
  input: Omit<CreateNoteDeFraisInput, "userId">,
): Promise<NoteDeFrais> {
  if (!input.titre?.trim()) throw new ValidationError("Le titre est requis");
  if (!input.numero?.trim()) throw new ValidationError("Le numéro est requis");
  assertPeriodeCoherente(input.periodeDebut, input.periodeFin);
  assertMontant(input.montantTotal, "Montant total");
  assertMontant(input.montantRembourse, "Montant remboursé");
  return repo.create(ctx, { ...input, userId: ctx.userId });
}

export async function modifierNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateNoteDeFraisInput,
): Promise<NoteDeFrais> {
  if (input.titre !== undefined && !input.titre.trim()) throw new ValidationError("Le titre est requis");
  assertPeriodeCoherente(input.periodeDebut, input.periodeFin);
  assertMontant(input.montantTotal, "Montant total");
  assertMontant(input.montantRembourse, "Montant remboursé");
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Note de frais introuvable");
  return updated;
}

export async function supprimerNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  id: number,
): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Note de frais introuvable");
}
