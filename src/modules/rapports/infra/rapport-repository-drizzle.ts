import { and, desc, eq } from "drizzle-orm";
import { clients, executionsRapports, factures, fournisseurs, interventions, rapportsPersonnalises, stocks } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ExecutionLog, IRapportRepository } from "../application/rapport-repository";
import { computeFinancier } from "../domain/rapport";
import type { CreateRapportInput, RapportFormat, RapportGraphiqueType, RapportPersonnalise, RapportType } from "../domain/rapport";

type Row = typeof rapportsPersonnalises.$inferSelect;

function toRapport(r: Row): RapportPersonnalise {
  return {
    id: r.id,
    artisanId: r.artisanId,
    nom: r.nom,
    description: r.description ?? null,
    type: r.type as RapportType,
    filtres: r.filtres ?? null,
    colonnes: r.colonnes ?? null,
    groupement: r.groupement ?? null,
    tri: r.tri ?? null,
    format: (r.format ?? null) as RapportFormat | null,
    graphiqueType: (r.graphiqueType ?? null) as RapportGraphiqueType | null,
    favori: r.favori ?? false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle des rapports. Tables `rapports_personnalises`/`executions_rapports` sous RLS
// (filtre explicite `artisanId` en plus). `runReport` lit l'entité ciblée, elle aussi scopée tenant.
export class RapportRepositoryDrizzle implements IRapportRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<RapportPersonnalise[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx.select().from(rapportsPersonnalises).where(eq(rapportsPersonnalises.artisanId, ctx.artisanId)).orderBy(desc(rapportsPersonnalises.updatedAt), desc(rapportsPersonnalises.id));
      return rows.map(toRapport);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<RapportPersonnalise | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.select().from(rapportsPersonnalises).where(and(eq(rapportsPersonnalises.id, id), eq(rapportsPersonnalises.artisanId, ctx.artisanId))).limit(1);
      return row ? toRapport(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateRapportInput): Promise<RapportPersonnalise> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(rapportsPersonnalises)
        .values({
          artisanId: ctx.artisanId,
          nom: input.nom,
          description: input.description ?? null,
          type: input.type,
          filtres: input.filtres ?? null,
          colonnes: input.colonnes ?? null,
          groupement: input.groupement ?? null,
          tri: input.tri ?? null,
          format: input.format ?? "tableau",
          graphiqueType: input.graphiqueType ?? null,
        })
        .returning();
      return toRapport(row);
    });
  }

  remove(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [owned] = await tx.select({ id: rapportsPersonnalises.id }).from(rapportsPersonnalises).where(and(eq(rapportsPersonnalises.id, id), eq(rapportsPersonnalises.artisanId, ctx.artisanId))).limit(1);
      if (!owned) return false;
      await tx.delete(executionsRapports).where(and(eq(executionsRapports.rapportId, id), eq(executionsRapports.artisanId, ctx.artisanId)));
      await tx.delete(rapportsPersonnalises).where(and(eq(rapportsPersonnalises.id, id), eq(rapportsPersonnalises.artisanId, ctx.artisanId)));
      return true;
    });
  }

  toggleFavori(ctx: TenantContext, id: number): Promise<RapportPersonnalise | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [cur] = await tx.select({ favori: rapportsPersonnalises.favori }).from(rapportsPersonnalises).where(and(eq(rapportsPersonnalises.id, id), eq(rapportsPersonnalises.artisanId, ctx.artisanId))).limit(1);
      if (!cur) return null;
      const [row] = await tx
        .update(rapportsPersonnalises)
        .set({ favori: !(cur.favori ?? false) })
        .where(and(eq(rapportsPersonnalises.id, id), eq(rapportsPersonnalises.artisanId, ctx.artisanId)))
        .returning();
      return row ? toRapport(row) : null;
    });
  }

  runReport(ctx: TenantContext, type: RapportType): Promise<unknown[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const aid = ctx.artisanId;
      switch (type) {
        case "ventes":
          return tx.select().from(factures).where(eq(factures.artisanId, aid)).orderBy(desc(factures.dateFacture));
        case "clients":
          return tx.select().from(clients).where(eq(clients.artisanId, aid)).orderBy(desc(clients.createdAt));
        case "interventions":
          return tx.select().from(interventions).where(eq(interventions.artisanId, aid)).orderBy(desc(interventions.dateDebut));
        case "stocks":
          return tx.select().from(stocks).where(eq(stocks.artisanId, aid));
        case "fournisseurs":
          return tx.select().from(fournisseurs).where(eq(fournisseurs.artisanId, aid));
        case "financier": {
          const facturesList = await tx.select({ statut: factures.statut, totalTTC: factures.totalTTC }).from(factures).where(eq(factures.artisanId, aid));
          return computeFinancier(facturesList.map((f) => ({ statut: f.statut ?? null, totalTTC: f.totalTTC ?? null })));
        }
        default:
          return [];
      }
    });
  }

  saveExecution(ctx: TenantContext, log: ExecutionLog): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx.insert(executionsRapports).values({
        rapportId: log.rapportId,
        artisanId: ctx.artisanId,
        parametres: log.parametres ?? {},
        resultats: log.resultats,
        nombreLignes: log.nombreLignes,
        tempsExecution: log.tempsExecution,
      });
    });
  }
}
