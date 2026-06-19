import { eq } from "drizzle-orm";
import { signaturesDevis } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { DevisSignatureReader, DevisSignatureInfo } from "../application/devis-signature-reader";

/*
 * Lecture d'une signature par devisId (`signatures_devis`, sans RLS/artisanId). ⚠️ N'est appelée que
 * pour des devis déjà confirmés du tenant (scoping par le parent) → pas de fuite cross-tenant.
 */
export class DevisSignatureReaderDrizzle implements DevisSignatureReader {
  constructor(private readonly db: DbClient) {}

  getByDevisId(ctx: TenantContext, devisId: number): Promise<DevisSignatureInfo | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx
        .select({ id: signaturesDevis.id, token: signaturesDevis.token, createdAt: signaturesDevis.createdAt })
        .from(signaturesDevis)
        .where(eq(signaturesDevis.devisId, devisId))
        .limit(1);
      return r ?? null;
    });
  }
}
