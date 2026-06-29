import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { StoragePort } from "../../../shared/ports/storage";
import type { IPiecesJointesRepository, PieceJointeRecord } from "./pieces-jointes-repository";

/** Limite de pièces jointes par document (devis ou facture). */
const MAX_PIECES_PAR_DOC = 10;

export interface PieceJointeWithUrl extends PieceJointeRecord {
  readonly url: string;
}

export async function listerPiecesDevis(
  repo: IPiecesJointesRepository,
  storage: StoragePort,
  ctx: TenantContext,
  devisId: number,
): Promise<PieceJointeWithUrl[]> {
  const pieces = await repo.listByDevis(ctx, devisId);
  return Promise.all(pieces.map(async (p) => ({ ...p, url: await storage.url(p.storageKey) })));
}

export async function listerPiecesFacture(
  repo: IPiecesJointesRepository,
  storage: StoragePort,
  ctx: TenantContext,
  factureId: number,
): Promise<PieceJointeWithUrl[]> {
  const pieces = await repo.listByFacture(ctx, factureId);
  return Promise.all(pieces.map(async (p) => ({ ...p, url: await storage.url(p.storageKey) })));
}

export async function supprimerPiece(
  repo: IPiecesJointesRepository,
  ctx: TenantContext,
  id: number,
): Promise<void> {
  const piece = await repo.getById(ctx, id);
  if (!piece) throw new NotFoundError("Pièce jointe introuvable");
  await repo.delete(ctx, id);
}

export async function attacherPieceDevis(
  repo: IPiecesJointesRepository,
  ctx: TenantContext,
  devisId: number,
  fileId: number,
): Promise<PieceJointeRecord> {
  await repo.assertDevisOwnership(ctx, devisId);
  const count = await repo.countByDevis(ctx, devisId);
  if (count >= MAX_PIECES_PAR_DOC) {
    throw new ValidationError(`Maximum ${MAX_PIECES_PAR_DOC} pièces jointes par devis`);
  }
  return repo.attach(ctx, { fileId, devisId });
}

export async function attacherPieceFacture(
  repo: IPiecesJointesRepository,
  ctx: TenantContext,
  factureId: number,
  fileId: number,
): Promise<PieceJointeRecord> {
  await repo.assertFactureOwnership(ctx, factureId);
  const count = await repo.countByFacture(ctx, factureId);
  if (count >= MAX_PIECES_PAR_DOC) {
    throw new ValidationError(`Maximum ${MAX_PIECES_PAR_DOC} pièces jointes par facture`);
  }
  return repo.attach(ctx, { fileId, factureId });
}
