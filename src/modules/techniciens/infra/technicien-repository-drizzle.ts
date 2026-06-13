import { and, asc, eq } from "drizzle-orm";
import {
  techniciens,
  positionsTechniciens,
  disponibilitesTechniciens,
  badgesTechniciens,
  objectifsTechniciens,
  classementTechniciens,
} from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "../application/technicien-repository";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";

type TechnicienRow = typeof techniciens.$inferSelect;

function toTechnicien(r: TechnicienRow): Technicien {
  return {
    id: r.id,
    artisanId: r.artisanId,
    nom: r.nom,
    prenom: r.prenom ?? null,
    email: r.email ?? null,
    telephone: r.telephone ?? null,
    specialite: r.specialite ?? null,
    couleur: r.couleur ?? null,
    statut: (r.statut ?? "actif") as Technicien["statut"],
    coutHoraire: r.coutHoraire ?? null,
    userId: r.userId ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository techniciens. Double cloisonnement : RLS (rôle app
// + app.tenant via withTenant) ET filtre explicite `artisanId`. La suppression purge les
// sous-ressources rattachées au technicien (positions/disponibilités/badges/objectifs/
// classement) — certaines n'ont pas d'artisanId, d'où la vérification d'ownership d'abord.
export class TechnicienRepositoryDrizzle implements ITechnicienRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Technicien[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(techniciens)
        .where(eq(techniciens.artisanId, ctx.artisanId))
        .orderBy(asc(techniciens.nom), asc(techniciens.id));
      return rows.map(toTechnicien);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Technicien | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(techniciens)
        .where(and(eq(techniciens.id, id), eq(techniciens.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toTechnicien(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateTechnicienInput): Promise<Technicien> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(techniciens)
        .values({ ...input, artisanId: ctx.artisanId } as typeof techniciens.$inferInsert)
        .returning();
      return toTechnicien(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateTechnicienInput): Promise<Technicien | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(techniciens)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(techniciens.id, id), eq(techniciens.artisanId, ctx.artisanId)))
        .returning();
      return row ? toTechnicien(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      // Vérifie l'appartenance AVANT de toucher les sous-ressources (certaines n'ont pas
      // d'artisanId → on ne doit pas supprimer celles d'un autre tenant). Atomique.
      const [owned] = await tx
        .select({ id: techniciens.id })
        .from(techniciens)
        .where(and(eq(techniciens.id, id), eq(techniciens.artisanId, ctx.artisanId)))
        .limit(1);
      if (!owned) return false;

      await tx.delete(positionsTechniciens).where(eq(positionsTechniciens.technicienId, id));
      await tx.delete(disponibilitesTechniciens).where(eq(disponibilitesTechniciens.technicienId, id));
      await tx.delete(badgesTechniciens).where(eq(badgesTechniciens.technicienId, id));
      await tx.delete(objectifsTechniciens).where(eq(objectifsTechniciens.technicienId, id));
      await tx.delete(classementTechniciens).where(eq(classementTechniciens.technicienId, id));

      const deleted = await tx
        .delete(techniciens)
        .where(and(eq(techniciens.id, id), eq(techniciens.artisanId, ctx.artisanId)))
        .returning({ id: techniciens.id });
      return deleted.length > 0;
    });
  }
}
