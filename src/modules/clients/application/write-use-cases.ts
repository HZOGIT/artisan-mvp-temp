import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IClientRepository } from "./client-repository";
import type { Client, CreateClientInput, UpdateClientInput } from "../domain/client";

// Use-cases d'écriture — purs, repository injecté. Validation métier (defense-in-depth,
// indépendante du transport) : `nom` requis, e-mail au format basique si fourni. ⚠️ PII :
// le scoping tenant est porté par le repo (cross-tenant → null → NotFound).
// La suppression avec garde d'intégrité référentielle est traitée séparément (étape dédiée).

// Format e-mail volontairement permissif (présence d'un « x@y.z »), aligné sur l'intention
// du legacy : on rejette une saisie manifestement invalide sans sur-contraindre.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function creerClient(repo: IClientRepository, ctx: TenantContext, input: CreateClientInput): Promise<Client> {
  if (!input.nom?.trim()) throw new ValidationError("Le nom est requis");
  if (input.email != null && input.email !== "" && !EMAIL_RE.test(input.email)) {
    throw new ValidationError("E-mail invalide");
  }
  return repo.create(ctx, input);
}

export async function modifierClient(
  repo: IClientRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateClientInput,
): Promise<Client> {
  if (input.nom !== undefined && !input.nom.trim()) throw new ValidationError("Le nom est requis");
  if (input.email != null && input.email !== "" && !EMAIL_RE.test(input.email)) {
    throw new ValidationError("E-mail invalide");
  }
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Client introuvable");
  return updated;
}
