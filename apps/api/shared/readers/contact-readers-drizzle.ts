import { and, eq } from "drizzle-orm";
import { artisans, clients } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";
import { withTenant } from "../db";
import type { TenantContext } from "../tenant";
import type { ArtisanReader, ArtisanInfo, ClientReader, ClientInfo } from "./contact-readers";

/*
 * Lecture de l'artisan émetteur (tenant courant) — ligne brute `artisans` (transmise au générateur
 * PDF legacy) ; scopée par `ctx.artisanId` (RLS).
 */
export class ArtisanReaderDrizzle implements ArtisanReader {
  constructor(private readonly db: DbClient) {}

  getArtisan(ctx: TenantContext): Promise<ArtisanInfo | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx.select().from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
      return (r as ArtisanInfo | undefined) ?? null;
    });
  }
}

/*
 * Lecture d'un client du tenant (destinataire). Anti-IDOR : filtre `clients.artisanId = ctx.artisanId`
 * (+ RLS) → null si le client n'appartient pas au tenant.
 */
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
