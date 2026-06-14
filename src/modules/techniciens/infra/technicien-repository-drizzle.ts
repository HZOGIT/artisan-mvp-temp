import { and, asc, desc, eq, or } from "drizzle-orm";
import {
  techniciens,
  positionsTechniciens,
  disponibilitesTechniciens,
  badgesTechniciens,
  objectifsTechniciens,
  classementTechniciens,
  habilitationsTechniciens,
  users,
  artisans,
} from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "../application/technicien-repository";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";
import type { Disponibilite, SetDisponibiliteInput } from "../domain/disponibilite";
import type { Position, EnregistrerPositionInput } from "../domain/position";
import type { UtilisateurLiable } from "../domain/utilisateur-liable";
import type { HabilitationTechnicien, AjouterHabilitationInput } from "../domain/habilitation";

type TechnicienRow = typeof techniciens.$inferSelect;
type DispoRow = typeof disponibilitesTechniciens.$inferSelect;
type PositionRow = typeof positionsTechniciens.$inferSelect;
type HabilitationRow = typeof habilitationsTechniciens.$inferSelect;

function toHabilitation(r: HabilitationRow): HabilitationTechnicien {
  return {
    id: r.id,
    technicienId: r.technicienId,
    type: r.type,
    numero: r.numero,
    organisme: r.organisme,
    dateObtention: r.dateObtention,
    dateExpiration: r.dateExpiration,
    createdAt: r.createdAt,
  };
}

function toPosition(r: PositionRow): Position {
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
  };
}

function toDispo(r: DispoRow): Disponibilite {
  return {
    id: r.id,
    technicienId: r.technicienId,
    jourSemaine: r.jourSemaine,
    heureDebut: r.heureDebut,
    heureFin: r.heureFin,
    disponible: r.disponible ?? true,
  };
}

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

  listDisponibilites(ctx: TenantContext, technicienId: number): Promise<Disponibilite[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return [];
      const rows = await tx
        .select()
        .from(disponibilitesTechniciens)
        .where(eq(disponibilitesTechniciens.technicienId, technicienId))
        .orderBy(asc(disponibilitesTechniciens.jourSemaine));
      return rows.map(toDispo);
    });
  }

  setDisponibilite(
    ctx: TenantContext,
    technicienId: number,
    input: SetDisponibiliteInput,
  ): Promise<Disponibilite | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return null;
      // Upsert par (technicienId, jourSemaine) : un seul créneau par jour.
      const [existing] = await tx
        .select()
        .from(disponibilitesTechniciens)
        .where(
          and(
            eq(disponibilitesTechniciens.technicienId, technicienId),
            eq(disponibilitesTechniciens.jourSemaine, input.jourSemaine),
          ),
        )
        .limit(1);
      if (existing) {
        const [row] = await tx
          .update(disponibilitesTechniciens)
          .set({ heureDebut: input.heureDebut, heureFin: input.heureFin, disponible: input.disponible })
          .where(eq(disponibilitesTechniciens.id, existing.id))
          .returning();
        return toDispo(row);
      }
      const [row] = await tx
        .insert(disponibilitesTechniciens)
        .values({
          technicienId,
          jourSemaine: input.jourSemaine,
          heureDebut: input.heureDebut,
          heureFin: input.heureFin,
          disponible: input.disponible,
        })
        .returning();
      return toDispo(row);
    });
  }

  getDernierePosition(ctx: TenantContext, technicienId: number): Promise<Position | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return null;
      const [row] = await tx
        .select()
        .from(positionsTechniciens)
        .where(eq(positionsTechniciens.technicienId, technicienId))
        .orderBy(desc(positionsTechniciens.id))
        .limit(1);
      return row ? toPosition(row) : null;
    });
  }

  enregistrerPosition(
    ctx: TenantContext,
    technicienId: number,
    input: EnregistrerPositionInput,
  ): Promise<Position | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return null;
      const [row] = await tx
        .insert(positionsTechniciens)
        .values({
          technicienId,
          latitude: input.latitude,
          longitude: input.longitude,
          precision: input.precision ?? null,
          vitesse: input.vitesse ?? null,
          cap: input.cap ?? null,
          batterie: input.batterie ?? null,
          enDeplacement: input.enDeplacement ?? false,
          interventionEnCoursId: input.interventionEnCoursId ?? null,
        })
        .returning();
      return toPosition(row);
    });
  }

  getUsersLiables(ctx: TenantContext): Promise<UtilisateurLiable[]> {
    return withTenant(this.db, ctx, async (tx) => {
      // `users`/`artisans` hors RLS tenant → filtre artisanId EXPLICITE.
      // Liables = le propriétaire (artisans.userId) + les collaborateurs (users.artisanId).
      const [art] = await tx
        .select({ userId: artisans.userId })
        .from(artisans)
        .where(eq(artisans.id, ctx.artisanId))
        .limit(1);
      if (!art) return [];
      const rows = await tx
        .select({ id: users.id, name: users.name, prenom: users.prenom, email: users.email, role: users.role })
        .from(users)
        .where(or(eq(users.id, art.userId), eq(users.artisanId, ctx.artisanId)))
        .orderBy(asc(users.id));
      return rows.map((u) => ({
        id: u.id,
        nom: [u.prenom, u.name].filter(Boolean).join(" ").trim() || (u.email ?? ""),
        email: u.email ?? null,
        role: u.role,
      }));
    });
  }

  listHabilitations(ctx: TenantContext, technicienId: number): Promise<HabilitationTechnicien[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return [];
      const rows = await tx
        .select()
        .from(habilitationsTechniciens)
        .where(eq(habilitationsTechniciens.technicienId, technicienId))
        .orderBy(asc(habilitationsTechniciens.dateExpiration), asc(habilitationsTechniciens.id));
      return rows.map(toHabilitation);
    });
  }

  ajouterHabilitation(
    ctx: TenantContext,
    technicienId: number,
    input: AjouterHabilitationInput,
  ): Promise<HabilitationTechnicien | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return null;
      const [row] = await tx
        .insert(habilitationsTechniciens)
        .values({
          technicienId,
          artisanId: ctx.artisanId,
          type: input.type,
          numero: input.numero ?? null,
          organisme: input.organisme ?? null,
          dateObtention: input.dateObtention ?? null,
          dateExpiration: input.dateExpiration ?? null,
        })
        .returning();
      return toHabilitation(row);
    });
  }

  supprimerHabilitation(ctx: TenantContext, technicienId: number, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return false;
      const deleted = await tx
        .delete(habilitationsTechniciens)
        .where(and(eq(habilitationsTechniciens.id, id), eq(habilitationsTechniciens.technicienId, technicienId)))
        .returning({ id: habilitationsTechniciens.id });
      return deleted.length > 0;
    });
  }

  // Le technicien appartient-il au tenant ? (techniciens a un artisanId → RLS + filtre)
  private async ownsTechnicien(tx: DbClient, ctx: TenantContext, technicienId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: techniciens.id })
      .from(techniciens)
      .where(and(eq(techniciens.id, technicienId), eq(techniciens.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }
}
