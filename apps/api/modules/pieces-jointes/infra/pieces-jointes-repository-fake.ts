import type { TenantContext } from "../../../shared/tenant";
import type { IPiecesJointesRepository, PieceJointeRecord, AttachPieceInput } from "../application/pieces-jointes-repository";

export class PiecesJointesRepositoryFake implements IPiecesJointesRepository {
  private store: PieceJointeRecord[] = [];
  private seq = 1;

  /** Seed a fake file record for tests. */
  seedFile(fileId: number, filename: string, mimeType: string, sizeBytes: number, storageKey: string): void {
    this._files.set(fileId, { filename, mimeType, sizeBytes, storageKey });
  }

  private _files = new Map<number, { filename: string; mimeType: string; sizeBytes: number; storageKey: string }>();

  async attach(ctx: TenantContext, input: AttachPieceInput): Promise<PieceJointeRecord> {
    const fileInfo = this._files.get(input.fileId) ?? { filename: null, mimeType: "application/octet-stream", sizeBytes: 0, storageKey: `key-${input.fileId}` };
    const record: PieceJointeRecord = {
      id: this.seq++,
      artisanId: ctx.artisanId,
      fileId: input.fileId,
      devisId: input.devisId ?? null,
      factureId: input.factureId ?? null,
      createdAt: new Date(),
      ...fileInfo,
    };
    this.store.push(record);
    return record;
  }

  async listByDevis(ctx: TenantContext, devisId: number): Promise<PieceJointeRecord[]> {
    return this.store.filter((r) => r.artisanId === ctx.artisanId && r.devisId === devisId);
  }

  async listByFacture(ctx: TenantContext, factureId: number): Promise<PieceJointeRecord[]> {
    return this.store.filter((r) => r.artisanId === ctx.artisanId && r.factureId === factureId);
  }

  async getById(ctx: TenantContext, id: number): Promise<PieceJointeRecord | null> {
    return this.store.find((r) => r.id === id && r.artisanId === ctx.artisanId) ?? null;
  }

  async delete(ctx: TenantContext, id: number): Promise<void> {
    this.store = this.store.filter((r) => !(r.id === id && r.artisanId === ctx.artisanId));
  }

  async countByDevis(ctx: TenantContext, devisId: number): Promise<number> {
    return this.store.filter((r) => r.artisanId === ctx.artisanId && r.devisId === devisId).length;
  }

  async countByFacture(ctx: TenantContext, factureId: number): Promise<number> {
    return this.store.filter((r) => r.artisanId === ctx.artisanId && r.factureId === factureId).length;
  }

  async assertDevisOwnership(_ctx: TenantContext, _devisId: number): Promise<void> {}

  async assertFactureOwnership(_ctx: TenantContext, _factureId: number): Promise<void> {}
}
