/**
 * C1 — Reconciler compta : détecte et répare les incohérences comptables des factures.
 *
 * Invariants traités :
 *   I1 — Facture émise/payée/en_retard sans AUCUNE écriture → génère VE (+ BQ si payée).
 *   I-revue-bq — Facture avec BQ mais sans VE (état partial ambigu) → revue manuelle.
 *   I-revue-brouillon — Facture payée avec écritures brouillon → revue manuelle
 *                       (validation = logique ecritureNum complexe, semi-auto strict).
 *
 * ⚠️  COMPTA = LÉGAL/SENSIBLE — Garde-fous STRICTS :
 *   - dryRun: true par défaut (observer les healing events avant d'armer).
 *   - Jamais de suppression ni d'écrasement d'écriture existante.
 *   - Circuit-breaker BAS (seuil = 10 par défaut).
 *   - ownerDb OBLIGATOIRE pour detect cross-tenant (RLS-FORCE sur ecritures_comptables + factures).
 *
 * ponytail: 3 phases dans une fonction, pas d'abstraction Reconciler<T> générique.
 */

import { and, eq, notExists, exists, lt, sql, inArray } from "drizzle-orm";
import {
  ecrituresComptables,
  factures,
  facturesLignes,
  eventOutbox,
} from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { runReconciler } from "../../../platform/scheduler";
import type { Anomalie, HealResult } from "../../../platform/scheduler";
import type { JobDefinition } from "../../../platform/scheduler";
import { dailyKey } from "../../../platform/scheduler";
import { COMPTE_CLIENT, COMPTE_VENTES, COMPTE_BANQUE, compteTvaCollectee } from "./comptes";

const STABLE_MIN = 5;
const SEUIL_DEFAULT = 10;

const STATUTS_EMIS = ["envoyee", "payee", "en_retard"] as const;

interface FactureDetails {
  readonly factureId: number;
  readonly statut: string;
  readonly totalTTC: string;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly dateFacture: Date;
  readonly datePaiement: Date | null;
  readonly numero: string | null;
  readonly regimeTVA: string | null;
}

export interface ComptaReconcilerOpts {
  readonly dryRun?: boolean;
  readonly seuil?: number;
  readonly onSeuilDepasse?: (anomalies: ReadonlyArray<Anomalie>) => Promise<void>;
}

export function createComptaReconcilerJob(
  ownerDb: DbClient,
  opts: ComptaReconcilerOpts = {},
): JobDefinition {
  return {
    name: "heal:compta",
    periodKey: dailyKey,
    run: () => runComptaReconciler(ownerDb, opts),
  };
}

/**
 * ownerDb : connexion artisan_user (owner) obligatoire.
 * ecritures_comptables + factures ont FORCE RLS — app_tenant sans SET app.tenant = 0 ligne.
 */
export async function runComptaReconciler(
  ownerDb: DbClient,
  opts: ComptaReconcilerOpts = {},
): Promise<void> {
  const { dryRun = true, seuil = SEUIL_DEFAULT, onSeuilDepasse } = opts;
  const stableCutoff = new Date(Date.now() - STABLE_MIN * 60_000);

  /* Phase 1 — I1 : facture émise/payée sans AUCUNE écriture → génère VE (+ BQ si payée) */
  await runReconciler<FactureDetails>(
    ownerDb,
    async () => {
      const rows = await ownerDb
        .select({
          id: factures.id,
          artisanId: factures.artisanId,
          statut: factures.statut,
          totalTTC: factures.totalTTC,
          totalHT: factures.totalHT,
          totalTVA: factures.totalTVA,
          dateFacture: factures.dateFacture,
          datePaiement: factures.datePaiement,
          numero: factures.numero,
          regimeTVA: factures.regimeTVA,
        })
        .from(factures)
        .where(
          and(
            inArray(factures.statut, [...STATUTS_EMIS]),
            sql`${factures.totalTTC}::numeric > 0`,
            eq(factures.typeDocument, "facture"),
            lt(factures.updatedAt, stableCutoff),
            notExists(
              ownerDb
                .select({ id: ecrituresComptables.id })
                .from(ecrituresComptables)
                .where(eq(ecrituresComptables.factureId, factures.id)),
            ),
          ),
        )
        .limit(50);

      return rows.map(
        (r): Anomalie<FactureDetails> => ({
          entityType: "facture",
          entityId: r.id,
          artisanId: r.artisanId,
          invariant: "ve-manquante",
          details: {
            factureId: r.id,
            statut: r.statut ?? "envoyee",
            totalTTC: r.totalTTC ?? "0.00",
            totalHT: r.totalHT ?? "0.00",
            totalTVA: r.totalTVA ?? "0.00",
            dateFacture: r.dateFacture,
            datePaiement: r.datePaiement ?? null,
            numero: r.numero ?? null,
            regimeTVA: r.regimeTVA ?? "normal",
          },
        }),
      );
    },

    async (anomalie: Anomalie<FactureDetails>, tx: DbClient): Promise<HealResult> => {
      const { artisanId, details: d } = anomalie;

      /* Guard : aucune écriture validée ne doit exister (double-vérif dans la tx) */
      const [guard] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(ecrituresComptables)
        .where(
          and(
            eq(ecrituresComptables.artisanId, artisanId),
            eq(ecrituresComptables.factureId, d.factureId),
            eq(ecrituresComptables.statut, "validee"),
          ),
        );
      if ((guard?.c ?? 0) > 0) {
        /* Ne peut pas arriver si detect est correct, mais guard défensif */
        throw new Error("has-validated-ecritures");
      }

      /* Lire les lignes TVA depuis la tx (facturesLignes n'a pas de RLS) */
      const tvaLignes = await tx
        .select({
          tauxTVA: facturesLignes.tauxTVA,
          montantTVA: facturesLignes.montantTVA,
        })
        .from(facturesLignes)
        .where(eq(facturesLignes.factureId, d.factureId));

      const veLignes = buildVeLignes(artisanId, d, tvaLignes);
      if (veLignes.length === 0) throw new Error("zero-ve-lignes");

      await tx.insert(ecrituresComptables).values(veLignes);

      /* Générer BQ si facture payée */
      let bqCount = 0;
      if (d.statut === "payee" && Number(d.totalTTC) > 0) {
        const bqLignes = buildBqLignes(artisanId, d);
        if (bqLignes.length > 0) {
          await tx.insert(ecrituresComptables).values(bqLignes);
          bqCount = bqLignes.length;
        }
      }

      return {
        avant: { hasEcritures: false },
        apres: { ve: veLignes.length, bq: bqCount },
        raison: "ve-manquante-generee-par-reconciler",
      };
    },

    async (anomalie: Anomalie<FactureDetails>, tx: DbClient): Promise<boolean> => {
      const rows = await tx
        .select({ id: ecrituresComptables.id })
        .from(ecrituresComptables)
        .where(
          and(
            eq(ecrituresComptables.artisanId, anomalie.artisanId),
            eq(ecrituresComptables.factureId, anomalie.details.factureId),
            eq(ecrituresComptables.journal, "VE"),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    { action: "healing.compta.ve-manquante", dryRun, seuil, onSeuilDepasse },
  );

  /* Phase 2 — I-revue-bq : BQ sans VE → état partial ambigu, pas d'auto-fix */
  const bqSansVe = await ownerDb
    .select({ id: factures.id, artisanId: factures.artisanId })
    .from(factures)
    .where(
      and(
        inArray(factures.statut, [...STATUTS_EMIS]),
        sql`${factures.totalTTC}::numeric > 0`,
        eq(factures.typeDocument, "facture"),
        lt(factures.updatedAt, stableCutoff),
        exists(
          ownerDb
            .select({ id: ecrituresComptables.id })
            .from(ecrituresComptables)
            .where(
              and(
                eq(ecrituresComptables.factureId, factures.id),
                eq(ecrituresComptables.journal, "BQ"),
              ),
            ),
        ),
        notExists(
          ownerDb
            .select({ id: ecrituresComptables.id })
            .from(ecrituresComptables)
            .where(
              and(
                eq(ecrituresComptables.factureId, factures.id),
                eq(ecrituresComptables.journal, "VE"),
              ),
            ),
        ),
      ),
    )
    .limit(50);

  for (const r of bqSansVe) {
    await ownerDb.insert(eventOutbox).values({
      artisanId: r.artisanId,
      userId: null,
      entityType: "facture",
      entityId: r.id,
      action: "healing.compta.revue-requise",
      payload: { invariant: "bq-sans-ve", factureId: r.id, dryRun },
    });
  }

  /* Phase 3 — I-revue-brouillon : facture payée avec écritures brouillon → revue manuelle */
  /* Semi-auto strict : ecritureNum légal (A47 LPF) requiert la logique use-case complète, pas d'auto-fix */
  const brouillonSurPayee = await ownerDb
    .select({ id: factures.id, artisanId: factures.artisanId })
    .from(factures)
    .where(
      and(
        eq(factures.statut, "payee"),
        lt(factures.updatedAt, stableCutoff),
        exists(
          ownerDb
            .select({ id: ecrituresComptables.id })
            .from(ecrituresComptables)
            .where(
              and(
                eq(ecrituresComptables.factureId, factures.id),
                eq(ecrituresComptables.statut, "brouillon"),
              ),
            ),
        ),
      ),
    )
    .limit(50);

  for (const r of brouillonSurPayee) {
    await ownerDb.insert(eventOutbox).values({
      artisanId: r.artisanId,
      userId: null,
      entityType: "facture",
      entityId: r.id,
      action: "healing.compta.revue-requise",
      payload: { invariant: "brouillon-sur-facture-payee", factureId: r.id, dryRun },
    });
  }
}

function buildVeLignes(
  artisanId: number,
  d: FactureDetails,
  tvaLignes: Array<{ tauxTVA: string | null; montantTVA: string | null }>,
) {
  const totalHT = Math.abs(Number(d.totalHT) || 0);
  const totalTVA = Math.abs(Number(d.totalTVA) || 0);
  const totalTTC = Math.abs(Number(d.totalTTC) || 0);
  if (totalTTC <= 0) return [];

  const pieceRef = d.numero ?? "";
  const libelle = `Facture ${pieceRef}`;
  const fmt = (n: number) => n.toFixed(2);
  const base = {
    artisanId,
    dateEcriture: d.dateFacture,
    journal: "VE" as const,
    pieceRef,
    libelle,
    factureId: d.factureId,
    statut: "brouillon" as const,
    pointage: false,
  };

  const result = [
    {
      ...base,
      numeroCompte: COMPTE_CLIENT.compte,
      libelleCompte: COMPTE_CLIENT.lib,
      debit: fmt(totalTTC),
      credit: "0.00",
    },
    {
      ...base,
      numeroCompte: COMPTE_VENTES.compte,
      libelleCompte: COMPTE_VENTES.lib,
      debit: "0.00",
      credit: fmt(totalHT),
    },
  ];

  if (d.regimeTVA !== "autoliquidation_btp" && totalTVA > 0) {
    const parCompte = new Map<string, { compte: string; lib: string; montant: number }>();
    let somme = 0;
    for (const l of tvaLignes) {
      const m = Math.abs(Number(l.montantTVA) || 0);
      if (m <= 0) continue;
      somme += m;
      const c = compteTvaCollectee(Number(l.tauxTVA) || 20);
      const cur = parCompte.get(c.compte) ?? { ...c, montant: 0 };
      parCompte.set(c.compte, { ...cur, montant: cur.montant + m });
    }
    const tvaVentilees =
      parCompte.size > 0 && Math.abs(somme - totalTVA) < 0.02
        ? Array.from(parCompte.values())
        : [{ ...compteTvaCollectee(20), montant: totalTVA }];
    for (const t of tvaVentilees) {
      result.push({
        ...base,
        numeroCompte: t.compte,
        libelleCompte: t.lib,
        debit: "0.00",
        credit: fmt(t.montant),
      });
    }
  }

  return result;
}

function buildBqLignes(artisanId: number, d: FactureDetails) {
  const totalTTC = Math.abs(Number(d.totalTTC) || 0);
  if (totalTTC <= 0) return [];

  const pieceRef = d.numero ?? "";
  const libelle = `Règlement ${pieceRef}`;
  const lettrage = `VL${d.factureId}`;
  const dateEcriture = d.datePaiement ?? d.dateFacture;
  const fmt = (n: number) => n.toFixed(2);
  const base = {
    artisanId,
    dateEcriture,
    journal: "BQ" as const,
    pieceRef,
    libelle,
    factureId: d.factureId,
    lettrage,
    statut: "brouillon" as const,
    pointage: false,
  };

  return [
    {
      ...base,
      numeroCompte: COMPTE_BANQUE.compte,
      libelleCompte: COMPTE_BANQUE.lib,
      debit: fmt(totalTTC),
      credit: "0.00",
    },
    {
      ...base,
      numeroCompte: COMPTE_CLIENT.compte,
      libelleCompte: COMPTE_CLIENT.lib,
      debit: "0.00",
      credit: fmt(totalTTC),
    },
  ];
}
