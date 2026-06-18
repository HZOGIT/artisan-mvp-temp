import { and, eq, inArray } from "drizzle-orm";
import { interventionsMobile } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateArriveeData, IInterventionMobileRepository, UpdateArriveeData, UpdateDepartData } from "../application/intervention-mobile-repository";
import type { InterventionMobile } from "../domain/intervention-mobile";

type Row = typeof interventionsMobile.$inferSelect;

function toMobile(r: Row): InterventionMobile {
  return {
    id: r.id,
    interventionId: r.interventionId,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    heureArrivee: r.heureArrivee ?? null,
    heureDepart: r.heureDepart ?? null,
    notesIntervention: r.notesIntervention ?? null,
    signatureClient: r.signatureClient ?? null,
    signatureDate: r.signatureDate ?? null,
  };
}

// Repository Drizzle des données mobiles d'intervention. Table `interventions_mobile` SOUS RLS
// (artisanId via `app.tenant`) → toutes les requêtes via `withTenant` ; `artisanId` posé explicitement
// à l'insertion (withCheck RLS). Scopage tenant garanti (anti-IDOR : la ligne mobile suit l'intervention
// du tenant, dont l'ownership est vérifié en amont par le use-case).
export class InterventionMobileRepositoryDrizzle implements IInterventionMobileRepository {
  constructor(private readonly db: DbClient) {}

  getByIntervention(ctx: TenantContext, interventionId: number): Promise<InterventionMobile | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.select().from(interventionsMobile).where(eq(interventionsMobile.interventionId, interventionId)).limit(1);
      return row ? toMobile(row) : null;
    });
  }

  getManyByInterventions(ctx: TenantContext, interventionIds: readonly number[]): Promise<Map<number, InterventionMobile>> {
    return withTenant(this.db, ctx, async (tx) => {
      const map = new Map<number, InterventionMobile>();
      if (interventionIds.length === 0) return map;
      const rows = await tx.select().from(interventionsMobile).where(inArray(interventionsMobile.interventionId, [...interventionIds]));
      for (const r of rows) map.set(r.interventionId, toMobile(r));
      return map;
    });
  }

  createArrivee(ctx: TenantContext, data: CreateArriveeData): Promise<InterventionMobile> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(interventionsMobile)
        .values({
          interventionId: data.interventionId,
          artisanId: ctx.artisanId,
          heureArrivee: data.heureArrivee,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        })
        .returning();
      return toMobile(row);
    });
  }

  updateArrivee(ctx: TenantContext, id: number, data: UpdateArriveeData): Promise<InterventionMobile> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(interventionsMobile)
        .set({ heureArrivee: data.heureArrivee, latitude: data.latitude ?? null, longitude: data.longitude ?? null, updatedAt: new Date() })
        .where(and(eq(interventionsMobile.id, id), eq(interventionsMobile.artisanId, ctx.artisanId)))
        .returning();
      return toMobile(row);
    });
  }

  async updateDepart(ctx: TenantContext, id: number, data: UpdateDepartData): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(interventionsMobile)
        .set({
          heureDepart: data.heureDepart,
          notesIntervention: data.notesIntervention ?? null,
          signatureClient: data.signatureClient ?? null,
          signatureDate: data.signatureDate ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(interventionsMobile.id, id), eq(interventionsMobile.artisanId, ctx.artisanId)));
    });
  }
}
