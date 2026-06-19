import { and, desc, eq } from "drizzle-orm";
import { ecrituresComptables } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IEcritureRepository } from "../application/ecriture-repository";
import type { EcritureComptable, CreateEcritureInput, JournalComptable } from "../domain/ecriture";

type EcritureRow = typeof ecrituresComptables.$inferSelect;

function toEcriture(r: EcritureRow): EcritureComptable {
  return {
    id: r.id,
    artisanId: r.artisanId,
    dateEcriture: r.dateEcriture,
    journal: r.journal as EcritureComptable["journal"],
    numeroCompte: r.numeroCompte,
    libelleCompte: r.libelleCompte ?? null,
    libelle: r.libelle,
    pieceRef: r.pieceRef ?? null,
    debit: r.debit ?? "0.00",
    credit: r.credit ?? "0.00",
    factureId: r.factureId ?? null,
    lettrage: r.lettrage ?? null,
    pointage: r.pointage ?? false,
    createdAt: r.createdAt,
  };
}

/*
 * Implémentation Drizzle du repository ecritures comptables. Double cloisonnement RLS + filtre
 * `artisanId` sur `ecritures_comptables`. ⚠️ Domaine financier CRITIQUE : le repo écrit des
 * lignes déjà calculées et **équilibrées** par le use-case ; l'`artisanId` est forcé au tenant.
 */
export class EcritureRepositoryDrizzle implements IEcritureRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<EcritureComptable[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(ecrituresComptables)
        .where(eq(ecrituresComptables.artisanId, ctx.artisanId))
        .orderBy(desc(ecrituresComptables.dateEcriture), desc(ecrituresComptables.id));
      return rows.map(toEcriture);
    });
  }

  listByFacture(ctx: TenantContext, factureId: number): Promise<EcritureComptable[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(ecrituresComptables)
        .where(and(eq(ecrituresComptables.artisanId, ctx.artisanId), eq(ecrituresComptables.factureId, factureId)))
        .orderBy(desc(ecrituresComptables.id));
      return rows.map(toEcriture);
    });
  }

  createMany(ctx: TenantContext, lignes: readonly CreateEcritureInput[]): Promise<EcritureComptable[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (lignes.length === 0) return [];
      const values = lignes.map((l) => ({
        artisanId: ctx.artisanId, // forcé au tenant
        dateEcriture: l.dateEcriture,
        journal: l.journal,
        numeroCompte: l.numeroCompte,
        libelleCompte: l.libelleCompte ?? null,
        libelle: l.libelle,
        pieceRef: l.pieceRef ?? null,
        debit: l.debit ?? "0.00",
        credit: l.credit ?? "0.00",
        factureId: l.factureId ?? null,
        lettrage: l.lettrage ?? null,
        pointage: l.pointage ?? false,
      }));
      const rows = await tx.insert(ecrituresComptables).values(values).returning();
      return rows.map(toEcriture);
    });
  }

  deleteByFacture(ctx: TenantContext, factureId: number): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(ecrituresComptables)
        .where(and(eq(ecrituresComptables.artisanId, ctx.artisanId), eq(ecrituresComptables.factureId, factureId)))
        .returning({ id: ecrituresComptables.id });
      return deleted.length;
    });
  }

  deleteByFactureJournal(ctx: TenantContext, factureId: number, journal: JournalComptable): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(ecrituresComptables)
        .where(
          and(
            eq(ecrituresComptables.artisanId, ctx.artisanId),
            eq(ecrituresComptables.factureId, factureId),
            eq(ecrituresComptables.journal, journal),
          ),
        )
        .returning({ id: ecrituresComptables.id });
      return deleted.length;
    });
  }
}
