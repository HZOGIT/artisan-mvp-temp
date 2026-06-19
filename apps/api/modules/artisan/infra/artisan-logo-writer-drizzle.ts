import { eq } from "drizzle-orm";
import { artisans } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { ArtisanLogoWriter } from "../application/artisan-logo-writer";

/*
 * `artisans` est une table d'IDENTITÉ (HORS RLS) → mise à jour par id (l'artisanId est résolu depuis
 * le cookie JWT, donc déjà prouvé appartenir à l'utilisateur authentifié).
 */
export class ArtisanLogoWriterDrizzle implements ArtisanLogoWriter {
  constructor(private readonly db: DbClient) {}

  async setLogo(artisanId: number, logo: string | null): Promise<void> {
    await this.db.update(artisans).set({ logo }).where(eq(artisans.id, artisanId));
  }
}
