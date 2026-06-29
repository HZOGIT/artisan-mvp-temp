import { eq, and, count } from "drizzle-orm";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db/with-tenant";
import type { TenantContext } from "../../../shared/tenant";
import { piecesJointes } from "../../../../../drizzle/schema/pieces-jointes";
import { files } from "../../../../../drizzle/schema/files";
import { devis } from "../../../../../drizzle/schema/devis";
import { factures } from "../../../../../drizzle/schema/factures";
import type { IPiecesJointesRepository, PieceJointeRecord, AttachPieceInput } from "../application/pieces-jointes-repository";
import { NotFoundError } from "../../../shared/errors";

function rowToRecord(row: typeof piecesJointes.$inferSelect & { filename: string | null; mimeType: string; sizeBytes: number; storageKey: string }): PieceJointeRecord {
  return {
    id: row.id,
    artisanId: row.artisanId,
    fileId: row.fileId,
    devisId: row.devisId ?? null,
    factureId: row.factureId ?? null,
    createdAt: row.createdAt,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
  };
}

export class PiecesJointesRepositoryDrizzle implements IPiecesJointesRepository {
  constructor(private readonly db: DbClient) {}

  async attach(ctx: TenantContext, input: AttachPieceInput): Promise<PieceJointeRecord> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.insert(piecesJointes).values({
        artisanId: ctx.artisanId,
        fileId: input.fileId,
        devisId: input.devisId ?? null,
        factureId: input.factureId ?? null,
      }).returning();
      const [fileRow] = await tx.select({ filename: files.filename, mimeType: files.mimeType, sizeBytes: files.sizeBytes, storageKey: files.storageKey })
        .from(files).where(eq(files.id, input.fileId));
      if (!row || !fileRow) throw new Error("Insertion piece_jointe ou lecture file introuvable");
      return rowToRecord({ ...row, ...fileRow });
    });
  }

  private async listJoined(ctx: TenantContext, devisId?: number, factureId?: number): Promise<PieceJointeRecord[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const cond = devisId !== undefined
        ? and(eq(piecesJointes.artisanId, ctx.artisanId), eq(piecesJointes.devisId, devisId))
        : and(eq(piecesJointes.artisanId, ctx.artisanId), eq(piecesJointes.factureId, factureId as number));
      const rows = await tx
        .select({
          id: piecesJointes.id, artisanId: piecesJointes.artisanId, fileId: piecesJointes.fileId,
          devisId: piecesJointes.devisId, factureId: piecesJointes.factureId, createdAt: piecesJointes.createdAt,
          filename: files.filename, mimeType: files.mimeType, sizeBytes: files.sizeBytes, storageKey: files.storageKey,
        })
        .from(piecesJointes)
        .innerJoin(files, eq(files.id, piecesJointes.fileId))
        .where(cond);
      return rows.map(rowToRecord);
    });
  }

  async listByDevis(ctx: TenantContext, devisId: number): Promise<PieceJointeRecord[]> {
    return this.listJoined(ctx, devisId, undefined);
  }

  async listByFacture(ctx: TenantContext, factureId: number): Promise<PieceJointeRecord[]> {
    return this.listJoined(ctx, undefined, factureId);
  }

  async getById(ctx: TenantContext, id: number): Promise<PieceJointeRecord | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          id: piecesJointes.id, artisanId: piecesJointes.artisanId, fileId: piecesJointes.fileId,
          devisId: piecesJointes.devisId, factureId: piecesJointes.factureId, createdAt: piecesJointes.createdAt,
          filename: files.filename, mimeType: files.mimeType, sizeBytes: files.sizeBytes, storageKey: files.storageKey,
        })
        .from(piecesJointes)
        .innerJoin(files, eq(files.id, piecesJointes.fileId))
        .where(and(eq(piecesJointes.id, id), eq(piecesJointes.artisanId, ctx.artisanId)));
      return rows[0] ? rowToRecord(rows[0]) : null;
    });
  }

  async delete(ctx: TenantContext, id: number): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx.delete(piecesJointes).where(and(eq(piecesJointes.id, id), eq(piecesJointes.artisanId, ctx.artisanId)));
    });
  }

  async countByDevis(ctx: TenantContext, devisId: number): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.select({ n: count() }).from(piecesJointes)
        .where(and(eq(piecesJointes.artisanId, ctx.artisanId), eq(piecesJointes.devisId, devisId)));
      return Number(row?.n ?? 0);
    });
  }

  async countByFacture(ctx: TenantContext, factureId: number): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.select({ n: count() }).from(piecesJointes)
        .where(and(eq(piecesJointes.artisanId, ctx.artisanId), eq(piecesJointes.factureId, factureId)));
      return Number(row?.n ?? 0);
    });
  }

  async assertDevisOwnership(ctx: TenantContext, devisId: number): Promise<void> {
    const rows = await withTenant(this.db, ctx, (tx) =>
      tx.select({ id: devis.id }).from(devis).where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId))).limit(1)
    );
    if (!rows[0]) throw new NotFoundError("Devis introuvable");
  }

  async assertFactureOwnership(ctx: TenantContext, factureId: number): Promise<void> {
    const rows = await withTenant(this.db, ctx, (tx) =>
      tx.select({ id: factures.id }).from(factures).where(and(eq(factures.id, factureId), eq(factures.artisanId, ctx.artisanId))).limit(1)
    );
    if (!rows[0]) throw new NotFoundError("Facture introuvable");
  }
}
