import { desc, eq, inArray } from "drizzle-orm";
import { positionsTechniciens, techniciens } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienPositionReader } from "../application/position-reader";
import type { PositionPoint, TechnicienAvecPosition } from "../domain/position";

type PosRow = typeof positionsTechniciens.$inferSelect;

function toPosition(r: PosRow): PositionPoint {
  return {
    id: r.id,
    technicienId: r.technicienId,
    latitude: r.latitude,
    longitude: r.longitude,
    precision: r.precision ?? null,
    vitesse: r.vitesse ?? null,
    cap: r.cap ?? null,
    batterie: r.batterie ?? null,
    enDeplacement: r.enDeplacement ?? false,
    interventionEnCoursId: r.interventionEnCoursId ?? null,
    timestamp: r.timestamp,
    createdAt: r.createdAt,
  };
}

// Lecteur Drizzle des positions. `techniciens` est sous RLS (filtre explicite `artisanId` en plus) →
// on ne voit QUE ses propres techniciens ; `positions_techniciens` n'a pas d'artisanId, on ne la lit
// donc QUE pour les `technicienId` possédés (anti-IDOR via le parent). Dernière position par technicien
// (timestamp décroissant). Lecture seule.
export class TechnicienPositionReaderDrizzle implements ITechnicienPositionReader {
  constructor(private readonly db: DbClient) {}

  async getPositions(ctx: TenantContext): Promise<TechnicienAvecPosition[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const techs = await tx
        .select({ id: techniciens.id, nom: techniciens.nom, prenom: techniciens.prenom, email: techniciens.email, telephone: techniciens.telephone, specialite: techniciens.specialite, couleur: techniciens.couleur })
        .from(techniciens)
        .where(eq(techniciens.artisanId, ctx.artisanId))
        .orderBy(techniciens.id);
      if (techs.length === 0) return [];

      // Toutes les positions des techniciens possédés, plus récentes d'abord → on retient la 1re par tech.
      const ids = techs.map((t) => t.id);
      const positions = await tx
        .select()
        .from(positionsTechniciens)
        .where(inArray(positionsTechniciens.technicienId, ids))
        .orderBy(desc(positionsTechniciens.timestamp), desc(positionsTechniciens.id));
      const latest = new Map<number, PosRow>();
      for (const p of positions) if (!latest.has(p.technicienId)) latest.set(p.technicienId, p);

      return techs.map((t) => ({
        id: t.id,
        nom: t.nom,
        prenom: t.prenom ?? null,
        email: t.email ?? null,
        telephone: t.telephone ?? null,
        specialite: t.specialite ?? null,
        couleur: t.couleur ?? null,
        position: latest.has(t.id) ? toPosition(latest.get(t.id)!) : null,
      }));
    });
  }
}
