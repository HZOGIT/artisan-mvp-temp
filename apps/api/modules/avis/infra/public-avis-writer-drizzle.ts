import { and, eq } from "drizzle-orm";
import { avisClients, demandesAvis, notifications } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { PublicAvisWriter, SoumettreAvisData } from "../application/avis-public-use-cases";

// Écrit la soumission publique d'un avis sous le **tenant résolu** (RLS) en une transaction :
// 1) insère l'avis (`avis_clients`, statut `publie`) ; 2) marque la demande `completee` (+ avisRecuAt) ;
// 3) notifie l'artisan. `artisanId` forcé = `ctx.artisanId` (cohérent RLS with-check).
export class PublicAvisWriterDrizzle implements PublicAvisWriter {
  constructor(private readonly db: DbClient) {}

  soumettre(ctx: TenantContext, data: SoumettreAvisData): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      const now = new Date();
      await tx.insert(avisClients).values({
        artisanId: ctx.artisanId,
        clientId: data.clientId,
        interventionId: data.interventionId,
        note: data.note,
        commentaire: data.commentaire,
        tokenAvis: data.tokenAvis,
        statut: "publie",
      });
      await tx
        .update(demandesAvis)
        .set({ statut: "completee", avisRecuAt: now })
        .where(and(eq(demandesAvis.id, data.demandeId), eq(demandesAvis.artisanId, ctx.artisanId)));
      await tx.insert(notifications).values({
        artisanId: ctx.artisanId,
        type: "info",
        titre: "Nouvel avis client",
        message: `Un client a laissé un avis ${data.note}/5`,
      });
    });
  }
}
