import { and, asc, between, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { artisans, clients, configurationsComptables, depenses, ecrituresComptables, facturesLignes, factures } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { DeclarationTVABrut, IComptabiliteReader, Periode } from "../application/comptabilite-reader";
import type { Ecriture } from "../domain/comptabilite";
import { DEFAULT_FEC_CONFIG } from "../domain/fec";
import type { FecConfig, FecFacture, FecInput } from "../domain/fec";

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

/*
 * Lecteur Drizzle comptable : écritures + agrégats scopés tenant (RLS via withTenant + filtre explicite
 * `artisanId`). Lecture seule.
 */
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

  fecInput(ctx: TenantContext, p: Periode): Promise<FecInput> {
    const dStr = p.dateDebut.toISOString().slice(0, 10);
    const fStr = p.dateFin.toISOString().slice(0, 10);
    return withTenant(this.db, ctx, async (tx) => {
      // 1) Factures de la période (journal VE) + client joint.
      const factRows = await tx
        .select({ id: factures.id, numero: factures.numero, dateFacture: factures.dateFacture, totalHT: factures.totalHT, totalTVA: factures.totalTVA, totalTTC: factures.totalTTC, statut: factures.statut, datePaiement: factures.datePaiement, typeDocument: factures.typeDocument, clientId: factures.clientId, clientNom: clients.nom, clientPrenom: clients.prenom })
        .from(factures)
        .leftJoin(clients, eq(clients.id, factures.clientId))
        .where(and(eq(factures.artisanId, ctx.artisanId), sql`DATE(${factures.dateFacture}) BETWEEN ${dStr} AND ${fStr}`, inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"])))
        .orderBy(asc(factures.dateFacture), asc(factures.id));
      // Lignes TVA groupées par (facture, taux) — 1 requête, regroupées en mémoire.
      const factIds = factRows.map((f) => f.id);
      const lignesByFacture = new Map<number, { tauxTVA: string | null; tva: string }[]>();
      if (factIds.length > 0) {
        const lignes = await tx
          .select({ factureId: facturesLignes.factureId, tauxTVA: facturesLignes.tauxTVA, tva: sql<string>`SUM(${facturesLignes.montantTVA})` })
          .from(facturesLignes)
          .where(inArray(facturesLignes.factureId, factIds))
          .groupBy(facturesLignes.factureId, facturesLignes.tauxTVA);
        for (const l of lignes) {
          const arr = lignesByFacture.get(l.factureId) ?? [];
          arr.push({ tauxTVA: l.tauxTVA ?? null, tva: l.tva });
          lignesByFacture.set(l.factureId, arr);
        }
      }
      const facturesFec: FecFacture[] = factRows.map((f) => ({ ...f, lignesTVA: lignesByFacture.get(f.id) ?? [] }));

      // 2) Dépenses de la période (journal AC).
      const depRows = await tx
        .select({ id: depenses.id, numero: depenses.numero, dateDepense: depenses.date_depense, fournisseur: depenses.fournisseur, categorie: depenses.categorie, montantHT: depenses.montant_ht, montantTVA: depenses.montant_tva, montantTTC: depenses.montant_ttc })
        .from(depenses)
        .where(and(eq(depenses.artisan_id, ctx.artisanId), between(depenses.date_depense, dStr, fStr)))
        .orderBy(asc(depenses.date_depense), asc(depenses.id));

      // 3) Encaissements (factures payées de la période, journal BQ).
      const encRows = await tx
        .select({ id: factures.id, numero: factures.numero, datePaiement: factures.datePaiement, totalTTC: factures.totalTTC, typeDocument: factures.typeDocument, clientId: factures.clientId, clientNom: clients.nom, clientPrenom: clients.prenom })
        .from(factures)
        .leftJoin(clients, eq(clients.id, factures.clientId))
        .where(and(eq(factures.artisanId, ctx.artisanId), eq(factures.statut, "payee"), isNotNull(factures.datePaiement), sql`DATE(${factures.datePaiement}) BETWEEN ${dStr} AND ${fStr}`))
        .orderBy(asc(factures.datePaiement), asc(factures.id));

      return {
        factures: facturesFec,
        depenses: depRows.map((d) => ({ ...d, dateDepense: d.dateDepense })),
        encaissements: encRows.map((e) => ({ ...e, datePaiement: e.datePaiement ?? new Date(0) })),
      };
    });
  }

  fecConfig(ctx: TenantContext): Promise<FecConfig> {
    return withTenant(this.db, ctx, async (tx) => {
      const [c] = await tx.select().from(configurationsComptables).where(eq(configurationsComptables.artisanId, ctx.artisanId)).limit(1);
      if (!c) return DEFAULT_FEC_CONFIG;
      return {
        compteVentes: c.compteVentes || DEFAULT_FEC_CONFIG.compteVentes,
        compteClients: c.compteClients || DEFAULT_FEC_CONFIG.compteClients,
        compteTVACollectee: c.compteTVACollectee ?? null,
        compteTVADeductible: c.compteTVADeductible || DEFAULT_FEC_CONFIG.compteTVADeductible,
        compteFournisseurs: c.compteFournisseurs || DEFAULT_FEC_CONFIG.compteFournisseurs,
        compteBanque: c.compteBanque || DEFAULT_FEC_CONFIG.compteBanque,
        journalVentes: c.journalVentes || DEFAULT_FEC_CONFIG.journalVentes,
        journalAchats: c.journalAchats || DEFAULT_FEC_CONFIG.journalAchats,
        journalBanque: c.journalBanque || DEFAULT_FEC_CONFIG.journalBanque,
      };
    });
  }

  async siret(ctx: TenantContext): Promise<string | null> {
    const [a] = await this.db.select({ siret: artisans.siret }).from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
    return a?.siret ?? null;
  }
}
