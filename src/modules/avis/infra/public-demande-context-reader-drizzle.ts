import { and, eq } from "drizzle-orm";
import { artisans, clients, interventions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { PublicDemandeContextReader, DemandeAvisContext } from "../application/avis-public-use-cases";

// Lecture des noms (artisan/client/intervention) d'une demande, sous le **tenant résolu** (la demande
// a été obtenue via le token, puis ses effets se lisent normalement sous RLS). Scopé `ctx.artisanId`.
export class PublicDemandeContextReaderDrizzle implements PublicDemandeContextReader {
  constructor(private readonly db: DbClient) {}

  getContext(ctx: TenantContext, clientId: number, interventionId: number): Promise<DemandeAvisContext> {
    return withTenant(this.db, ctx, async (tx) => {
      const [a] = await tx.select({ nom: artisans.nomEntreprise }).from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
      const [c] = await tx
        .select({ nom: clients.nom })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);
      const [i] = await tx
        .select({ titre: interventions.titre, dateDebut: interventions.dateDebut })
        .from(interventions)
        .where(and(eq(interventions.id, interventionId), eq(interventions.artisanId, ctx.artisanId)))
        .limit(1);
      return {
        artisanNomEntreprise: a?.nom ?? null,
        clientNom: c?.nom ?? null,
        interventionTitre: i?.titre ?? null,
        interventionDateDebut: i?.dateDebut ?? null,
      };
    });
  }
}
