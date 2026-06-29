import { and, asc, desc, eq, gte, lte, ne, notInArray, sql } from "drizzle-orm";
import { conges, techniciens, soldesConges } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository, AjustementSolde, ReportSolde, SoldeResult } from "../application/conge-repository";
import type { Conge, CongeStatut, CreateCongeInput, UpdateCongeInput } from "../domain/conge";
import { periodeReference } from "../application/solde";

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

/*
 * Implémentation Drizzle du repository conges. Double cloisonnement RLS + filtre `artisanId`.
 * ⚠️ Toute requête by-id porte `and(eq(id), eq(artisanId, ctx.artisanId))` → aucune fuite
 * cross-tenant. `update` ne touche que les métadonnées de la demande (`UpdateCongeInput`
 * exclut statut/validePar/dateValidation) → le workflow d'approbation est porté ailleurs.
 */
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
      /*
       * `input` (UpdateCongeInput) n'inclut pas statut/validePar/dateValidation → ces champs
       * du workflow d'approbation restent intacts ; seules les métadonnées changent.
       */
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

  ajusterSolde(ctx: TenantContext, { technicienId, type, annee, periodeDebut, periodeFin, deltaJours }: AjustementSolde): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Préférer la recherche par période (new-stack) ; fallback annee sans période (legacy). */
      const [existing] = await tx
        .select({ id: soldesConges.id })
        .from(soldesConges)
        .where(
          and(
            eq(soldesConges.technicienId, technicienId),
            eq(soldesConges.artisanId, ctx.artisanId),
            eq(soldesConges.type, type),
            eq(soldesConges.periodeDebut, periodeDebut),
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
        await tx.insert(soldesConges).values({
          technicienId,
          artisanId: ctx.artisanId,
          type,
          annee,
          periodeDebut,
          periodeFin,
          joursReportes: "0.00",
          soldeInitial: "0.00",
          soldeRestant: "0.00",
          joursAcquis: "0.00",
          joursPris: String(deltaJours),
        });
      }
    });
  }

  reporterSolde(ctx: TenantContext, { technicienId, type, annee, periodeDebut, periodeFin, joursReportes }: ReportSolde): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      const [existing] = await tx
        .select({ id: soldesConges.id })
        .from(soldesConges)
        .where(
          and(
            eq(soldesConges.technicienId, technicienId),
            eq(soldesConges.artisanId, ctx.artisanId),
            eq(soldesConges.type, type),
            eq(soldesConges.periodeDebut, periodeDebut),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .update(soldesConges)
          .set({ joursReportes: String(joursReportes), updatedAt: new Date() })
          .where(eq(soldesConges.id, existing.id));
      } else {
        await tx.insert(soldesConges).values({
          technicienId,
          artisanId: ctx.artisanId,
          type,
          annee,
          periodeDebut,
          periodeFin,
          joursReportes: String(joursReportes),
          soldeInitial: "0.00",
          soldeRestant: "0.00",
          joursAcquis: "0.00",
          joursPris: "0.00",
        });
      }
    });
  }

  getSolde(ctx: TenantContext, technicienId: number, annee: number, periodeDebut?: string): Promise<SoldeResult[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const cond = periodeDebut
        ? and(
            eq(soldesConges.technicienId, technicienId),
            eq(soldesConges.artisanId, ctx.artisanId),
            eq(soldesConges.periodeDebut, periodeDebut),
          )
        : and(
            eq(soldesConges.technicienId, technicienId),
            eq(soldesConges.artisanId, ctx.artisanId),
            eq(soldesConges.annee, annee),
          );
      const rows = await tx.select().from(soldesConges).where(cond);
      return rows.map((r) => {
        const exercice = r.periodeDebut ? periodeReference(r.periodeDebut).exercice : null;
        return {
          type: r.type as SoldeResult["type"],
          annee: r.annee,
          periodeDebut: r.periodeDebut ?? null,
          periodeFin: r.periodeFin ?? null,
          exercice,
          soldeInitial: Number(r.soldeInitial),
          soldeRestant: Number(r.soldeRestant),
          joursAcquis: Number(r.joursAcquis),
          joursPris: Number(r.joursPris),
          joursReportes: Number(r.joursReportes),
        };
      });
    });
  }

  getTechnicienDateEmbauche(ctx: TenantContext, technicienId: number): Promise<Date | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ createdAt: techniciens.createdAt })
        .from(techniciens)
        .where(and(eq(techniciens.id, technicienId), eq(techniciens.artisanId, ctx.artisanId)))
        .limit(1);
      return row?.createdAt ?? null;
    });
  }

  listTechniciensSolde(ctx: TenantContext, annee: number, periodeDebut?: string): Promise<Array<{ technicienId: number; dateEmbauche: Date; joursPris: number; joursReportes: number }>> {
    return withTenant(this.db, ctx, async (tx) => {
      const joinCond = periodeDebut
        ? and(
            eq(soldesConges.technicienId, techniciens.id),
            eq(soldesConges.artisanId, techniciens.artisanId),
            eq(soldesConges.type, "conge_paye"),
            eq(soldesConges.periodeDebut, periodeDebut),
          )
        : and(
            eq(soldesConges.technicienId, techniciens.id),
            eq(soldesConges.artisanId, techniciens.artisanId),
            eq(soldesConges.type, "conge_paye"),
            eq(soldesConges.annee, annee),
          );
      const rows = await tx
        .select({
          technicienId: techniciens.id,
          dateEmbauche: techniciens.createdAt,
          joursPris: sql<number>`COALESCE(${soldesConges.joursPris}, 0)::float`,
          joursReportes: sql<number>`COALESCE(${soldesConges.joursReportes}, 0)::float`,
        })
        .from(techniciens)
        .leftJoin(soldesConges, joinCond)
        .where(eq(techniciens.artisanId, ctx.artisanId));
      return rows;
    });
  }

  withDb(db: DbClient): CongeRepositoryDrizzle {
    return new CongeRepositoryDrizzle(db);
  }

  hasOverlap(
    ctx: TenantContext,
    { technicienId, dateDebut, dateFin, excludeId }: { technicienId: number; dateDebut: string; dateFin: string; excludeId?: number },
  ): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const conds = [
        eq(conges.artisanId, ctx.artisanId),
        eq(conges.technicienId, technicienId),
        notInArray(conges.statut, ["annule", "refuse"]),
        lte(conges.dateDebut, dateFin),
        gte(conges.dateFin, dateDebut),
      ];
      if (excludeId) conds.push(ne(conges.id, excludeId));
      const [row] = await tx.select({ id: conges.id }).from(conges).where(and(...conds)).limit(1);
      return !!row;
    });
  }
}
