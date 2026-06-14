import { and, asc, between, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { depenses, ecrituresComptables, facturesLignes, factures } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { DeclarationTVABrut, IComptabiliteReader, Periode } from "../application/comptabilite-reader";
import type { Ecriture } from "../domain/comptabilite";

type Row = typeof ecrituresComptables.$inferSelect;

function toEcriture(r: Row): Ecriture {
  return {
    id: r.id,
    dateEcriture: r.dateEcriture,
    journal: r.journal,
    numeroCompte: r.numeroCompte,
    libelleCompte: r.libelleCompte ?? null,
    libelle: r.libelle,
    pieceRef: r.pieceRef ?? null,
    debit: r.debit ?? null,
    credit: r.credit ?? null,
    factureId: r.factureId ?? null,
    lettrage: r.lettrage ?? null,
    pointage: r.pointage ?? null,
  };
}

// Lecteur Drizzle comptable : écritures + agrégats scopés tenant (RLS via withTenant + filtre explicite
// `artisanId`). Lecture seule.
export class ComptabiliteReaderDrizzle implements IComptabiliteReader {
  constructor(private readonly db: DbClient) {}

  listEcritures(ctx: TenantContext, p: Periode): Promise<Ecriture[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(ecrituresComptables)
        .where(and(eq(ecrituresComptables.artisanId, ctx.artisanId), gte(ecrituresComptables.dateEcriture, p.dateDebut), lte(ecrituresComptables.dateEcriture, p.dateFin)))
        .orderBy(asc(ecrituresComptables.numeroCompte), asc(ecrituresComptables.dateEcriture));
      return rows.map(toEcriture);
    });
  }

  listJournalVentes(ctx: TenantContext, p: Periode): Promise<Ecriture[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(ecrituresComptables)
        .where(and(eq(ecrituresComptables.artisanId, ctx.artisanId), eq(ecrituresComptables.journal, "VE"), gte(ecrituresComptables.dateEcriture, p.dateDebut), lte(ecrituresComptables.dateEcriture, p.dateFin)))
        .orderBy(asc(ecrituresComptables.dateEcriture));
      return rows.map(toEcriture);
    });
  }

  declarationTVADetail(ctx: TenantContext, p: Periode): Promise<DeclarationTVABrut> {
    const dStr = p.dateDebut.toISOString().slice(0, 10);
    const fStr = p.dateFin.toISOString().slice(0, 10);
    return withTenant(this.db, ctx, async (tx) => {
      // Base HT + TVA collectée par taux, depuis les lignes de factures émises (non brouillon/annulées).
      const rows = await tx
        .select({ taux: facturesLignes.tauxTVA, baseHT: sql<string>`SUM(${facturesLignes.montantHT})`, tva: sql<string>`SUM(${facturesLignes.montantTVA})` })
        .from(facturesLignes)
        .innerJoin(factures, eq(factures.id, facturesLignes.factureId))
        .where(and(eq(factures.artisanId, ctx.artisanId), sql`DATE(${factures.dateFacture}) BETWEEN ${dStr} AND ${fStr}`, inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"])))
        .groupBy(facturesLignes.tauxTVA)
        .orderBy(desc(facturesLignes.tauxTVA));
      const parTaux = rows.map((r) => ({ taux: Number(r.taux ?? 0), baseHT: Number(r.baseHT ?? 0), tvaCollectee: Number(r.tva ?? 0) }));
      // TVA déductible depuis les dépenses déductibles de la période.
      const [ded] = await tx
        .select({ tva: sql<string>`COALESCE(SUM(${depenses.montant_tva}), 0)` })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, ctx.artisanId), between(depenses.date_depense, dStr, fStr), eq(depenses.tva_deductible, true)));
      return { parTaux, tvaDeductible: Number(ded?.tva ?? 0) };
    });
  }
}
