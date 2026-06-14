import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRelanceDevisRepository } from "./relance-devis-repository";
import { STATUTS_RELANCE, TYPES_RELANCE } from "../domain/relance-devis";
import type { CreateRelanceInput, RelanceDevis } from "../domain/relance-devis";

// Use-cases d'écriture — purs, repository injecté. ⚠️ Journal append-only : pas de `modifier` (une
// relance est immuable) ; seulement enregistrer + supprimer. Validation métier + anti-IDOR-FK sur
// `devisId`. Le scoping tenant est porté par le repo.

export async function enregistrerRelance(
  repo: IRelanceDevisRepository,
  ctx: TenantContext,
  input: CreateRelanceInput,
): Promise<RelanceDevis> {
  if (!TYPES_RELANCE.includes(input.type)) throw new ValidationError("Type de relance invalide");
  if (input.statut !== undefined && !STATUTS_RELANCE.includes(input.statut)) {
    throw new ValidationError("Statut de relance invalide");
  }
  // Anti-IDOR-FK : le devis doit appartenir au tenant. NotFound (ne révèle pas l'existence cross-tenant).
  if (!(await repo.ownsDevis(ctx, input.devisId))) throw new NotFoundError("Devis introuvable");
  return repo.create(ctx, input);
}

export async function supprimerRelance(repo: IRelanceDevisRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Relance introuvable");
}
