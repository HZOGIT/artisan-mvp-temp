import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IFactureRepository } from "./facture-repository";
import type { Facture, FactureLigne, AuditLogEntry } from "../domain/facture";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getFacture` sur une ressource d'un autre tenant → le
// repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant). Les lignes sont
// scopées via la facture parente (→ [] si la facture n'appartient pas au tenant).

export function listFactures(repo: IFactureRepository, ctx: TenantContext): Promise<Facture[]> {
  return repo.list(ctx);
}

export async function getFacture(repo: IFactureRepository, ctx: TenantContext, id: number): Promise<Facture> {
  const facture = await repo.getById(ctx, id);
  if (!facture) throw new NotFoundError("Facture introuvable");
  return facture;
}

export function listLignesFacture(repo: IFactureRepository, ctx: TenantContext, factureId: number): Promise<FactureLigne[]> {
  return repo.listLignes(ctx, factureId);
}

// Avoirs émis sur une facture (parité legacy `getAvoirsByFacture`). ⚠️ Behavior-preserving : le
// legacy renvoie `[]` si la facture est introuvable/hors tenant (PAS 404) → on vérifie l'ownership
// via getById et on renvoie [] le cas échéant.
export async function getAvoirsFacture(repo: IFactureRepository, ctx: TenantContext, factureId: number): Promise<Facture[]> {
  const facture = await repo.getById(ctx, factureId);
  if (!facture) return [];
  return repo.listAvoirs(ctx, factureId);
}

// Journal d'audit d'une facture (parité legacy `getAuditLog`). Même garde behavior-preserving :
// `[]` si la facture n'appartient pas au tenant (pas 404).
export async function getAuditLogFacture(repo: IFactureRepository, ctx: TenantContext, factureId: number): Promise<AuditLogEntry[]> {
  const facture = await repo.getById(ctx, factureId);
  if (!facture) return [];
  return repo.listAuditLog(ctx, factureId);
}
