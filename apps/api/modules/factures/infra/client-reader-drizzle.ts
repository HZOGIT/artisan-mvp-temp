import { and, eq } from "drizzle-orm";
import { clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ClientReader, ClientInfo } from "../application/contact-readers";

// Lecture d'un client du tenant (destinataire) pour l'email + le PDF facture. Anti-IDOR : filtre
// `clients.artisanId = ctx.artisanId` (+ RLS) → null si le client n'appartient pas au tenant.
export class ClientReaderDrizzle implements ClientReader {
  constructor(private readonly db: DbClient) {}

  getClient(ctx: TenantContext, clientId: number): Promise<ClientInfo | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);
      return (r as ClientInfo | undefined) ?? null;
    });
  }
}
