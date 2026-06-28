import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IClientRepository } from "./client-repository";
import type { Client, CreateClientInput, UpdateClientInput } from "../domain/client";

/*
 * Use-cases d'écriture — purs, repository injecté. Validation métier (defense-in-depth,
 * indépendante du transport) : `nom` requis, e-mail au format basique si fourni. ⚠️ PII :
 * le scoping tenant est porté par le repo (cross-tenant → null → NotFound).
 * La suppression avec garde d'intégrité référentielle est traitée séparément (étape dédiée).
 */

/*
 * Format e-mail volontairement permissif (présence d'un « x@y.z »), aligné sur l'intention
 * du legacy : on rejette une saisie manifestement invalide sans sur-contraindre.
 */
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

/*
 * Supprime un client AVEC garde d'intégrité référentielle : un client encore référencé par
 * des documents métier (devis/factures/interventions/chantiers/contrats) ne peut pas être
 * supprimé (sinon documents orphelins / factures cassées). Corrige le défaut du legacy
 * (hard delete sans garde). NotFound si le client n'appartient pas au tenant.
 */
export async function supprimerClient(repo: IClientRepository, ctx: TenantContext, id: number): Promise<void> {
  const client = await repo.getById(ctx, id);
  if (!client) throw new NotFoundError("Client introuvable");
  const lies = await repo.countDocumentsLies(ctx, id);
  if (lies > 0) {
    throw new ConflictError(
      `Suppression refusée : ce client est référencé par ${lies} document(s) (devis, factures, interventions…). Archivez-le ou supprimez d'abord les documents liés.`,
    );
  }
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Client introuvable");
}

/*
 * Fusionne un doublon dans un client survivant (déduplication CRM). Tout l'historique du doublon
 * (devis/factures/interventions/chantiers/contrats/avis/rdv/conversations…) est réaffecté au
 * survivant dans UNE transaction (le repo), puis le doublon est archivé (jamais supprimé).
 * Idempotent. ⚠️ Cloisonnement tenant : si l'un des deux n'appartient pas au tenant → NotFound
 * (le repo renvoie null) ; impossible de fusionner vers/depuis le client d'un autre artisan.
 */
export async function fusionnerClients(
  repo: IClientRepository,
  ctx: TenantContext,
  survivantId: number,
  doublonId: number,
): Promise<Client> {
  if (survivantId === doublonId) {
    throw new ValidationError("Le survivant et le doublon doivent être deux clients différents");
  }
  const survivant = await repo.fusionner(ctx, survivantId, doublonId);
  if (!survivant) throw new NotFoundError("Client introuvable");
  return survivant;
}
