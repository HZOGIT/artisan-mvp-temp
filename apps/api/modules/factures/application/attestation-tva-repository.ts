import type { TenantContext } from "../../../shared/tenant";

export interface AttestationTvaRow {
  readonly id: number;
  readonly artisanId: number;
  readonly factureId: number | null;
  readonly devisId: number | null;
  readonly s3Key: string;
  readonly signedS3Key: string | null;
  readonly statut: "genere" | "signe";
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateAttestationInput {
  readonly artisanId: number;
  readonly factureId?: number | null;
  readonly devisId?: number | null;
  readonly s3Key: string;
}

export interface IAttestationTvaRepository {
  create(ctx: TenantContext, input: CreateAttestationInput): Promise<AttestationTvaRow>;
  attacherSignee(ctx: TenantContext, id: number, signedS3Key: string): Promise<AttestationTvaRow>;
  listByFacture(ctx: TenantContext, factureId: number): Promise<AttestationTvaRow[]>;
  listByDevis(ctx: TenantContext, devisId: number): Promise<AttestationTvaRow[]>;
  hasSigned(ctx: TenantContext, factureId?: number | null, devisId?: number | null): Promise<boolean>;
}
