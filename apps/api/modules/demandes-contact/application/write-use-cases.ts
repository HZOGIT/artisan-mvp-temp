import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeContactRepository } from "./demande-contact-repository";
import type { CreateDemandeInput, DemandeContact, UpdateDemandeInput } from "../domain/demande-contact";

// Use-cases d'écriture (création / métadonnées / suppression) — purs, repository injecté.
// ⚠️ Les transitions de statut (marquerContacte/convertir/marquerPerdu) sont des use-cases dédiés
// (7/9) : elles ne passent pas par `modifierDemande`. Validation métier.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function assertEmail(email: string | null | undefined): void {
  if (email === undefined || email === null) return;
  if (!EMAIL.test(email)) throw new ValidationError("L'email est invalide");
}

function assertSource(source: string | undefined): void {
  if (source === undefined) return;
  if (source.length > 50) throw new ValidationError("La source est limitée à 50 caractères");
}

export async function creerDemande(repo: IDemandeContactRepository, ctx: TenantContext, input: CreateDemandeInput): Promise<DemandeContact> {
  if (!input.nom?.trim()) throw new ValidationError("Le nom est requis");
  assertEmail(input.email);
  assertSource(input.source);
  return repo.create(ctx, input); // statut "nouveau" + clientId null forcés par l'infra
}

export async function modifierDemande(repo: IDemandeContactRepository, ctx: TenantContext, id: number, input: UpdateDemandeInput): Promise<DemandeContact> {
  if (input.nom !== undefined && !input.nom.trim()) throw new ValidationError("Le nom est requis");
  assertEmail(input.email);
  assertSource(input.source);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Demande de contact introuvable");
  return updated;
}

export async function supprimerDemande(repo: IDemandeContactRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Demande de contact introuvable");
}
