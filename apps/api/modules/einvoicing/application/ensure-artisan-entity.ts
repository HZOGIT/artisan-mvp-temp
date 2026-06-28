import { eq } from "drizzle-orm";
import { artisans } from "../../../../../drizzle/schema/artisans";
import { paEntites } from "../../../../../drizzle/schema/einvoicing";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db/with-tenant";
import type { TenantContext } from "../../../shared/tenant";
import type { PaPort } from "./pa-port";

export async function ensureArtisanEntity(
  db: DbClient,
  pa: PaPort,
  ctx: TenantContext,
  fournisseur = "fake",
): Promise<{ paEntityId: string; kybStatut: string }> {
  const [artisan] = await db
    .select({ siret: artisans.siret, nomEntreprise: artisans.nomEntreprise, email: artisans.email })
    .from(artisans)
    .where(eq(artisans.id, ctx.artisanId))
    .limit(1);

  if (!artisan?.siret) throw new Error("SIRET manquant — complétez votre profil avant d'activer la facturation électronique");

  const { paEntityId, kybStatut } = await pa.ensureEntity({
    siret: artisan.siret,
    nom: artisan.nomEntreprise ?? "",
    email: artisan.email ?? "",
    artisanId: ctx.artisanId,
  });

  await withTenant(db, ctx, async (tx) => {
    await tx
      .insert(paEntites)
      .values({ artisanId: ctx.artisanId, fournisseur, paEntityId, kybStatut, statutProvisioning: "done" })
      .onConflictDoUpdate({
        target: [paEntites.artisanId, paEntites.fournisseur],
        set: { paEntityId, kybStatut, statutProvisioning: "done", updatedAt: new Date() },
      });
  });

  return { paEntityId, kybStatut };
}
