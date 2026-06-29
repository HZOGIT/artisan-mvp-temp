import type { TenantContext } from "../../../shared/tenant";

export interface PieceJointeRecord {
  readonly id: number;
  readonly artisanId: number;
  readonly fileId: number;
  readonly devisId: number | null;
  readonly factureId: number | null;
  readonly createdAt: Date;
  readonly filename: string | null;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageKey: string;
}

export interface AttachPieceInput {
  readonly fileId: number;
  readonly devisId?: number;
  readonly factureId?: number;
}

export interface IPiecesJointesRepository {
  attach(ctx: TenantContext, input: AttachPieceInput): Promise<PieceJointeRecord>;
  listByDevis(ctx: TenantContext, devisId: number): Promise<PieceJointeRecord[]>;
  listByFacture(ctx: TenantContext, factureId: number): Promise<PieceJointeRecord[]>;
  getById(ctx: TenantContext, id: number): Promise<PieceJointeRecord | null>;
  delete(ctx: TenantContext, id: number): Promise<void>;
  countByDevis(ctx: TenantContext, devisId: number): Promise<number>;
  countByFacture(ctx: TenantContext, factureId: number): Promise<number>;
  /** Lève NotFoundError si le devis n'appartient pas au tenant. */
  assertDevisOwnership(ctx: TenantContext, devisId: number): Promise<void>;
  /** Lève NotFoundError si la facture n'appartient pas au tenant. */
  assertFactureOwnership(ctx: TenantContext, factureId: number): Promise<void>;
}
