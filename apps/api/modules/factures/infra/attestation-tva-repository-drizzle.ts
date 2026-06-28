import { and, eq } from "drizzle-orm";
import { attestationsTva } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { AttestationTvaRow, CreateAttestationInput, IAttestationTvaRepository } from "../application/attestation-tva-repository";

export class AttestationTvaRepositoryDrizzle implements IAttestationTvaRepository {
  constructor(private readonly db: DbClient) {}

  async create(ctx: TenantContext, input: CreateAttestationInput): Promise<AttestationTvaRow> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(attestationsTva)
        .values({
          artisanId: ctx.artisanId,
          factureId: input.factureId ?? null,
          devisId: input.devisId ?? null,
          s3Key: input.s3Key,
          statut: "genere",
        })
        .returning();
      return row as AttestationTvaRow;
    });
  }

  async attacherSignee(ctx: TenantContext, id: number, signedS3Key: string): Promise<AttestationTvaRow> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(attestationsTva)
        .set({ signedS3Key, statut: "signe" })
        .where(and(eq(attestationsTva.id, id), eq(attestationsTva.artisanId, ctx.artisanId)))
        .returning();
      return row as AttestationTvaRow;
    });
  }

  listByFacture(ctx: TenantContext, factureId: number): Promise<AttestationTvaRow[]> {
    return withTenant(this.db, ctx, async (tx) =>
      tx
        .select()
        .from(attestationsTva)
        .where(and(eq(attestationsTva.artisanId, ctx.artisanId), eq(attestationsTva.factureId, factureId)))
        .then((rows) => rows as AttestationTvaRow[]),
    );
  }

  listByDevis(ctx: TenantContext, devisId: number): Promise<AttestationTvaRow[]> {
    return withTenant(this.db, ctx, async (tx) =>
      tx
        .select()
        .from(attestationsTva)
        .where(and(eq(attestationsTva.artisanId, ctx.artisanId), eq(attestationsTva.devisId, devisId)))
        .then((rows) => rows as AttestationTvaRow[]),
    );
  }

  /** true si le document a au moins une attestation signée */
  async hasSigned(ctx: TenantContext, factureId?: number | null, devisId?: number | null): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      if (factureId != null) {
        const rows = await tx.select({ id: attestationsTva.id }).from(attestationsTva)
          .where(and(eq(attestationsTva.artisanId, ctx.artisanId), eq(attestationsTva.factureId, factureId), eq(attestationsTva.statut, "signe")))
          .limit(1);
        return rows.length > 0;
      }
      if (devisId != null) {
        const rows = await tx.select({ id: attestationsTva.id }).from(attestationsTva)
          .where(and(eq(attestationsTva.artisanId, ctx.artisanId), eq(attestationsTva.devisId, devisId), eq(attestationsTva.statut, "signe")))
          .limit(1);
        return rows.length > 0;
      }
      return false;
    });
  }
}
