import { and, eq } from "drizzle-orm";
import { devis, devisOptions } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IPortalDevisOptionsWriter } from "../application/portal-devis-options-writer";

export { type IPortalDevisOptionsWriter };

export class PortalDevisOptionsWriterDrizzle implements IPortalDevisOptionsWriter {
  constructor(private readonly db: DbClient) {}

  selectOptionForClient(ctx: TenantContext, optionId: number, clientId: number): Promise<number | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** `devis_options` n'a pas d'artisanId : scoping via join `devis` (RLS tenant_isolation active). */
      const [o] = await tx
        .select({ devisId: devisOptions.devisId })
        .from(devisOptions)
        .innerJoin(devis, and(eq(devis.id, devisOptions.devisId), eq(devis.clientId, clientId)))
        .where(eq(devisOptions.id, optionId))
        .limit(1);
      if (!o) return null;
      await tx.update(devisOptions).set({ selectionnee: false }).where(eq(devisOptions.devisId, o.devisId));
      await tx
        .update(devisOptions)
        .set({ selectionnee: true, dateSelection: new Date() })
        .where(and(eq(devisOptions.id, optionId), eq(devisOptions.devisId, o.devisId)));
      return o.devisId;
    });
  }
}
