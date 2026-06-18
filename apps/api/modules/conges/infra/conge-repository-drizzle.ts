import { and, asc, desc, eq, sql } from "drizzle-orm";
import { conges, techniciens, soldesConges } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository, AjustementSolde } from "../application/conge-repository";
import type { Conge, CongeStatut, CreateCongeInput, UpdateCongeInput } from "../domain/conge";

type CongeRow = typeof conges.$inferSelect;

function toConge(r: CongeRow): Conge {
  return {
    id: r.id,
    artisanId: r.artisanId,
    technicienId: r.technicienId,
    type: r.type as Conge["type"],
    dateDebut: r.dateDebut,
    dateFin: r.dateFin,
    demiJourneeDebut: r.demiJourneeDebut ?? false,
    demiJourneeFin: r.demiJourneeFin ?? false,
    motif: r.motif ?? null,
    statut: (r.statut ?? "en_attente") as Conge["statut"],
    commentaireValidation: r.commentaireValidation ?? null,
    dateValidation: r.dateValidation ?? null,
    validePar: r.validePar ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository conges. Double cloisonnement RLS + filtre `artisanId`.
// ⚠️ Toute requête by-id porte `and(eq(id), eq(artisanId, ctx.artisanId))` → aucune fuite
// cross-tenant. `update` ne touche que les métadonnées de la demande (`UpdateCongeInput`
// exclut statut/validePar/dateValidation) → le workflow d'approbation est porté ailleurs.
export class CongeRepositoryDrizzle implements ICongeRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Conge[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(conges)
        .where(eq(conges.artisanId, ctx.artisanId))
        .orderBy(desc(conges.dateDebut), desc(conges.id));
      return rows.map(toConge);
    });
  }

  listEnAttente(ctx: TenantContext): Promise<Conge[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(conges)
        .where(and(eq(conges.artisanId, ctx.artisanId), eq(conges.statut, "en_attente")))
        .orderBy(asc(conges.dateDebut));
      return rows.map(toConge);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Conge | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(conges)
        .where(and(eq(conges.id, id), eq(conges.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toConge(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateCongeInput): Promise<Conge> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(conges)
        .values({ ...input, artisanId: ctx.artisanId } as typeof conges.$inferInsert)
        .returning();
      return toConge(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateCongeInput): Promise<Conge | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // `input` (UpdateCongeInput) n'inclut pas statut/validePar/dateValidation → ces champs
      // du workflow d'approbation restent intacts ; seules les métadonnées changent.
      const [row] = await tx
        .update(conges)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(conges.id, id), eq(conges.artisanId, ctx.artisanId)))
        .returning();
      return row ? toConge(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(conges)
        .where(and(eq(conges.id, id), eq(conges.artisanId, ctx.artisanId)))
        .returning({ id: conges.id });
      return deleted.length > 0;
    });
  }

  ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(techniciens)
        .where(and(eq(techniciens.id, technicienId), eq(techniciens.artisanId, ctx.artisanId)));
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

  setStatut(
    ctx: TenantContext,
    id: number,
    statut: CongeStatut,
    validePar: number,
    commentaire?: string | null,
  ): Promise<Conge | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(conges)
        .set({
          statut,
          validePar,
          dateValidation: new Date(),
          commentaireValidation: commentaire ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(conges.id, id), eq(conges.artisanId, ctx.artisanId)))
        .returning();
      return row ? toConge(row) : null;
    });
  }

  ajusterSolde(ctx: TenantContext, { technicienId, type, annee, deltaJours }: AjustementSolde): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      // Check-then-act scopé tenant (pas de clé unique sur (technicien,type,annee)).
      const [existing] = await tx
        .select({ id: soldesConges.id })
        .from(soldesConges)
        .where(
          and(
            eq(soldesConges.technicienId, technicienId),
            eq(soldesConges.artisanId, ctx.artisanId),
            eq(soldesConges.type, type),
            eq(soldesConges.annee, annee),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .update(soldesConges)
          .set({
            joursPris: sql`${soldesConges.joursPris} + ${deltaJours}`,
            soldeRestant: sql`GREATEST(0, ${soldesConges.soldeRestant} - ${deltaJours})`,
            updatedAt: new Date(),
          })
          .where(eq(soldesConges.id, existing.id));
      } else if (deltaJours > 0) {
        // Absente + décompte → insert (trace le décompte ; soldeRestant planché à 0).
        await tx.insert(soldesConges).values({
          technicienId,
          artisanId: ctx.artisanId,
          type,
          annee,
          soldeInitial: "0.00",
          soldeRestant: "0.00",
          joursAcquis: "0.00",
          joursPris: String(deltaJours),
        });
      }
      // Absente + recrédit (≤0) → no-op (rien n'avait été décompté).
    });
  }
}
