import { and, asc, desc, eq } from "drizzle-orm";
import { badges, badgesTechniciens, classementTechniciens, techniciens } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IBadgeRepository } from "../application/badge-repository";
import type { Badge, BadgeTechnicien, CreateBadgeInput, UpdateBadgeInput } from "../domain/badge";
import type { ClassementEntry, PeriodeClassement } from "../domain/classement";

type BadgeRow = typeof badges.$inferSelect;
type BadgeTechRow = typeof badgesTechniciens.$inferSelect;
type ClassementRow = typeof classementTechniciens.$inferSelect;

function toClassement(r: ClassementRow): ClassementEntry {
  return {
    id: r.id,
    technicienId: r.technicienId,
    artisanId: r.artisanId,
    periode: r.periode as PeriodeClassement,
    dateDebut: r.dateDebut,
    dateFin: r.dateFin,
    rang: r.rang,
    pointsTotal: r.pointsTotal ?? 0,
    interventions: r.interventions ?? 0,
    ca: r.ca ?? "0.00",
    noteMoyenne: r.noteMoyenne ?? null,
    createdAt: r.createdAt,
  };
}

function toBadge(r: BadgeRow): Badge {
  return {
    id: r.id,
    artisanId: r.artisanId,
    code: r.code,
    nom: r.nom,
    description: r.description ?? null,
    icone: r.icone ?? null,
    couleur: r.couleur ?? null,
    categorie: (r.categorie ?? "interventions") as Badge["categorie"],
    condition: r.condition ?? null,
    seuil: r.seuil ?? null,
    points: r.points ?? 0,
    actif: r.actif ?? true,
    createdAt: r.createdAt,
  };
}

function toBadgeTech(r: BadgeTechRow): BadgeTechnicien {
  return {
    id: r.id,
    technicienId: r.technicienId,
    badgeId: r.badgeId,
    dateObtention: r.dateObtention,
    valeurAtteinte: r.valeurAtteinte ?? null,
    notifie: r.notifie ?? false,
  };
}

// Implémentation Drizzle du repository badges. Double cloisonnement sur `badges`
// (RLS rôle app + app.tenant via withTenant) ET filtre explicite `artisanId`.
// `badges_techniciens` n'a pas d'artisanId → on vérifie l'appartenance du technicien
// ET du badge au tenant avant tout accès (ressource hors tenant → []/null) : anti-IDOR.
export class BadgeRepositoryDrizzle implements IBadgeRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Badge[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(badges)
        .where(eq(badges.artisanId, ctx.artisanId))
        .orderBy(desc(badges.createdAt), desc(badges.id));
      return rows.map(toBadge);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Badge | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(badges)
        .where(and(eq(badges.id, id), eq(badges.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toBadge(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateBadgeInput): Promise<Badge> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(badges)
        .values({ ...input, artisanId: ctx.artisanId } as typeof badges.$inferInsert)
        .returning();
      return toBadge(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateBadgeInput): Promise<Badge | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(badges)
        .set({ ...input })
        .where(and(eq(badges.id, id), eq(badges.artisanId, ctx.artisanId)))
        .returning();
      return row ? toBadge(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      // Vérifie l'appartenance AVANT de toucher les attributions (badges_techniciens
      // n'a pas d'artisanId → on ne doit pas supprimer celles d'un autre tenant).
      if (!(await this.ownsBadge(tx, ctx, id))) return false;
      await tx.delete(badgesTechniciens).where(eq(badgesTechniciens.badgeId, id));
      const deleted = await tx
        .delete(badges)
        .where(and(eq(badges.id, id), eq(badges.artisanId, ctx.artisanId)))
        .returning({ id: badges.id });
      return deleted.length > 0;
    });
  }

  listBadgesTechnicien(ctx: TenantContext, technicienId: number): Promise<BadgeTechnicien[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return [];
      const rows = await tx
        .select()
        .from(badgesTechniciens)
        .where(eq(badgesTechniciens.technicienId, technicienId))
        .orderBy(desc(badgesTechniciens.dateObtention), desc(badgesTechniciens.id));
      return rows.map(toBadgeTech);
    });
  }

  attribuer(
    ctx: TenantContext,
    technicienId: number,
    badgeId: number,
    valeurAtteinte?: number | null,
  ): Promise<BadgeTechnicien | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Technicien ET badge doivent appartenir au tenant (anti-IDOR sur les deux FK).
      if (!(await this.ownsTechnicien(tx, ctx, technicienId))) return null;
      if (!(await this.ownsBadge(tx, ctx, badgeId))) return null;

      // Idempotent : une attribution déjà existante est renvoyée telle quelle.
      const [existing] = await tx
        .select()
        .from(badgesTechniciens)
        .where(and(eq(badgesTechniciens.technicienId, technicienId), eq(badgesTechniciens.badgeId, badgeId)))
        .limit(1);
      if (existing) return toBadgeTech(existing);

      const [row] = await tx
        .insert(badgesTechniciens)
        .values({ technicienId, badgeId, valeurAtteinte: valeurAtteinte ?? null })
        .returning();
      return toBadgeTech(row);
    });
  }

  getClassement(ctx: TenantContext, periode: PeriodeClassement): Promise<ClassementEntry[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(classementTechniciens)
        .where(and(eq(classementTechniciens.artisanId, ctx.artisanId), eq(classementTechniciens.periode, periode)))
        .orderBy(asc(classementTechniciens.rang));
      return rows.map(toClassement);
    });
  }

  // Le badge appartient-il au tenant ? (RLS + filtre artisanId)
  private async ownsBadge(tx: DbClient, ctx: TenantContext, badgeId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: badges.id })
      .from(badges)
      .where(and(eq(badges.id, badgeId), eq(badges.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
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
