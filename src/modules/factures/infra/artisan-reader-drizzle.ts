import { eq } from "drizzle-orm";
import { artisans } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ArtisanReader, ArtisanInfo } from "../application/contact-readers";

// Lecture de l'artisan émetteur (tenant courant) pour l'email + le PDF facture. Renvoie la ligne
// brute `artisans` (transmise au générateur PDF legacy) ; scopée par `ctx.artisanId` (RLS).
export class ArtisanReaderDrizzle implements ArtisanReader {
  constructor(private readonly db: DbClient) {}

  getArtisan(ctx: TenantContext): Promise<ArtisanInfo | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx.select().from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
      return (r as ArtisanInfo | undefined) ?? null;
    });
  }
}
