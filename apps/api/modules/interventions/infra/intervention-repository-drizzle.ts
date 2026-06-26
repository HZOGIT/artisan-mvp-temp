import { and, asc, desc, eq, getTableColumns, gte, lte, ne, sql } from "drizzle-orm";
import { interventions, interventionsMobile, clients, techniciens, devis, factures, interventionsTechniciens, couleursInterventions } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionRepository, InterventionRefKind } from "../application/intervention-repository";
import type {
  Intervention,
  CreateInterventionInput,
  UpdateInterventionInput,
  EquipeMembre,
  EquipeMembreArtisan,
  AjouterMembreEquipeInput,
} from "../domain/intervention";

type InterventionRow = typeof interventions.$inferSelect & { heureArrivee?: Date | null; heureDepart?: Date | null };

function toIntervention(r: InterventionRow): Intervention {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    titre: r.titre,
    description: r.description ?? null,
    dateDebut: r.dateDebut,
    dateFin: r.dateFin ?? null,
    statut: (r.statut ?? "planifiee") as Intervention["statut"],
    adresse: r.adresse ?? null,
    notes: r.notes ?? null,
    devisId: r.devisId ?? null,
    factureId: r.factureId ?? null,
    technicienId: r.technicienId ?? null,
    heureArrivee: r.heureArrivee ?? null,
    heureDepart: r.heureDepart ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Implémentation Drizzle du repository interventions. Double cloisonnement RLS + filtre
 * `artisanId`. ⚠️ Toute requête by-id porte `and(eq(id), eq(artisanId, ctx.artisanId))` →
 * aucune fuite cross-tenant. `create` insère les FK fournies (clientId/technicienId/…) SANS
 * vérifier leur ownership : la garde anti-IDOR-FK est portée par le use-case d'écriture (4/9).
 */
export class InterventionRepositoryDrizzle implements IInterventionRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Intervention[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ ...getTableColumns(interventions), heureArrivee: interventionsMobile.heureArrivee, heureDepart: interventionsMobile.heureDepart })
        .from(interventions)
        .leftJoin(interventionsMobile, and(eq(interventionsMobile.interventionId, interventions.id), eq(interventionsMobile.artisanId, ctx.artisanId)))
        .where(eq(interventions.artisanId, ctx.artisanId))
        .orderBy(desc(interventions.dateDebut), desc(interventions.id));
      return rows.map(toIntervention);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Intervention | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ ...getTableColumns(interventions), heureArrivee: interventionsMobile.heureArrivee, heureDepart: interventionsMobile.heureDepart })
        .from(interventions)
        .leftJoin(interventionsMobile, and(eq(interventionsMobile.interventionId, interventions.id), eq(interventionsMobile.artisanId, ctx.artisanId)))
        .where(and(eq(interventions.id, id), eq(interventions.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toIntervention(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateInterventionInput): Promise<Intervention> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(interventions)
        .values({ ...input, artisanId: ctx.artisanId } as typeof interventions.$inferInsert)
        .returning();
      return toIntervention(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateInterventionInput): Promise<Intervention | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(interventions)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(interventions.id, id), eq(interventions.artisanId, ctx.artisanId)))
        .returning();
      return row ? toIntervention(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(interventions)
        .where(and(eq(interventions.id, id), eq(interventions.artisanId, ctx.artisanId)))
        .returning({ id: interventions.id });
      return deleted.length > 0;
    });
  }

  ownsRef(ctx: TenantContext, kind: InterventionRefKind, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const n = sql<number>`count(*)::int`;
      /** Chaque table cible porte un `artisanId` (toutes RLS-isolées) → double cloisonnement. */
      let row: { n: number } | undefined;
      switch (kind) {
        case "client":
          [row] = await tx.select({ n }).from(clients).where(and(eq(clients.id, id), eq(clients.artisanId, ctx.artisanId)));
          break;
        case "technicien":
          [row] = await tx.select({ n }).from(techniciens).where(and(eq(techniciens.id, id), eq(techniciens.artisanId, ctx.artisanId)));
          break;
        case "devis":
          [row] = await tx.select({ n }).from(devis).where(and(eq(devis.id, id), eq(devis.artisanId, ctx.artisanId)));
          break;
        case "facture":
          [row] = await tx.select({ n }).from(factures).where(and(eq(factures.id, id), eq(factures.artisanId, ctx.artisanId)));
          break;
      }
      return (row?.n ?? 0) > 0;
    });
  }

  findTechnicienIdForUser(ctx: TenantContext): Promise<number | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ id: techniciens.id })
        .from(techniciens)
        .where(and(eq(techniciens.userId, ctx.userId), eq(techniciens.artisanId, ctx.artisanId)))
        .limit(1);
      return row?.id ?? null;
    });
  }

  listByTechnicien(ctx: TenantContext, technicienId: number): Promise<Intervention[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(interventions)
        .where(and(eq(interventions.artisanId, ctx.artisanId), eq(interventions.technicienId, technicienId)))
        .orderBy(desc(interventions.dateDebut), desc(interventions.id));
      return rows.map(toIntervention);
    });
  }

  listJour(ctx: TenantContext, dayStart: Date, dayEnd: Date): Promise<Intervention[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(interventions)
        .where(
          and(
            eq(interventions.artisanId, ctx.artisanId),
            gte(interventions.dateDebut, dayStart),
            lte(interventions.dateDebut, dayEnd),
            ne(interventions.statut, "annulee"),
          ),
        );
      return rows.map(toIntervention);
    });
  }

  listEquipe(ctx: TenantContext, interventionId: number): Promise<EquipeMembre[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          id: interventionsTechniciens.id,
          technicienId: interventionsTechniciens.technicienId,
          role: interventionsTechniciens.role,
          nom: techniciens.nom,
          prenom: techniciens.prenom,
        })
        .from(interventionsTechniciens)
        .leftJoin(techniciens, eq(interventionsTechniciens.technicienId, techniciens.id))
        .where(and(eq(interventionsTechniciens.interventionId, interventionId), eq(interventionsTechniciens.artisanId, ctx.artisanId)))
        .orderBy(asc(interventionsTechniciens.id));
      return rows.map((r) => ({ id: r.id, technicienId: r.technicienId, role: r.role ?? null, nom: r.nom ?? null, prenom: r.prenom ?? null }));
    });
  }

  listEquipesArtisan(ctx: TenantContext): Promise<EquipeMembreArtisan[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          id: interventionsTechniciens.id,
          interventionId: interventionsTechniciens.interventionId,
          technicienId: interventionsTechniciens.technicienId,
          role: interventionsTechniciens.role,
          nom: techniciens.nom,
          prenom: techniciens.prenom,
        })
        .from(interventionsTechniciens)
        .leftJoin(techniciens, eq(interventionsTechniciens.technicienId, techniciens.id))
        .where(eq(interventionsTechniciens.artisanId, ctx.artisanId))
        .orderBy(asc(interventionsTechniciens.id));
      return rows.map((r) => ({
        id: r.id,
        interventionId: r.interventionId,
        technicienId: r.technicienId,
        role: r.role ?? null,
        nom: r.nom ?? null,
        prenom: r.prenom ?? null,
      }));
    });
  }

  addMembreEquipe(ctx: TenantContext, input: AjouterMembreEquipeInput): Promise<EquipeMembre> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Idempotent : si (intervention, technicien) existe déjà dans le tenant, on le renvoie. */
      const enrich = async (id: number): Promise<EquipeMembre> => {
        const [m] = await tx
          .select({
            id: interventionsTechniciens.id,
            technicienId: interventionsTechniciens.technicienId,
            role: interventionsTechniciens.role,
            nom: techniciens.nom,
            prenom: techniciens.prenom,
          })
          .from(interventionsTechniciens)
          .leftJoin(techniciens, eq(interventionsTechniciens.technicienId, techniciens.id))
          .where(eq(interventionsTechniciens.id, id))
          .limit(1);
        return { id: m.id, technicienId: m.technicienId, role: m.role ?? null, nom: m.nom ?? null, prenom: m.prenom ?? null };
      };
      const [existing] = await tx
        .select({ id: interventionsTechniciens.id })
        .from(interventionsTechniciens)
        .where(
          and(
            eq(interventionsTechniciens.interventionId, input.interventionId),
            eq(interventionsTechniciens.technicienId, input.technicienId),
            eq(interventionsTechniciens.artisanId, ctx.artisanId),
          ),
        )
        .limit(1);
      if (existing) return enrich(existing.id);
      const [inserted] = await tx
        .insert(interventionsTechniciens)
        .values({
          artisanId: ctx.artisanId,
          interventionId: input.interventionId,
          technicienId: input.technicienId,
          role: input.role ?? null,
        })
        .returning({ id: interventionsTechniciens.id });
      return enrich(inserted.id);
    });
  }

  removeMembreEquipe(ctx: TenantContext, id: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .delete(interventionsTechniciens)
        .where(and(eq(interventionsTechniciens.id, id), eq(interventionsTechniciens.artisanId, ctx.artisanId)));
    });
  }

  listCouleurs(ctx: TenantContext): Promise<Array<{ interventionId: number; couleur: string }>> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ interventionId: couleursInterventions.interventionId, couleur: couleursInterventions.couleur })
        .from(couleursInterventions)
        .where(eq(couleursInterventions.artisanId, ctx.artisanId));
      return rows;
    });
  }

  setCouleur(ctx: TenantContext, interventionId: number, couleur: string): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Upsert sur la PK (artisanId, interventionId) → idempotent, scopé tenant. */
      await tx
        .insert(couleursInterventions)
        .values({ artisanId: ctx.artisanId, interventionId, couleur })
        .onConflictDoUpdate({ target: [couleursInterventions.artisanId, couleursInterventions.interventionId], set: { couleur } });
    });
  }

  withDb(db: DbClient): InterventionRepositoryDrizzle {
    return new InterventionRepositoryDrizzle(db);
  }
}
