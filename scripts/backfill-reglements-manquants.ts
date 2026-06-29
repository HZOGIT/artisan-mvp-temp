/**
 * Backfill one-shot — crée les entrées reglements manquantes pour les factures
 * payées via l'ancien chemin enregistrerPaiement (qui ne créait pas de reglements).
 *
 * Usage (sur la base déployée 5433) :
 *   DATABASE_URL=postgres://artisan_user:... pnpm exec tsx scripts/backfill-reglements-manquants.ts
 *
 * Idempotent : ignore les factures dont montantPaye est déjà couvert par Σ(reglements).
 */

import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL requis");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

type Row = {
  id: number;
  artisan_id: number;
  montant_paye: string;
  date_paiement: string | null;
  mode_paiement: string | null;
  reglement_sum: string | null;
};

const VALID_MODES = new Set(["cheque", "virement", "especes", "carte", "autre"]);

function toMode(raw: string | null): "cheque" | "virement" | "especes" | "carte" | "autre" {
  return VALID_MODES.has(raw ?? "") ? (raw as "cheque" | "virement" | "especes" | "carte" | "autre") : "autre";
}

async function run() {
  const { rows } = await pool.query<Row>(`
    SELECT
      f.id,
      f."artisanId" AS artisan_id,
      f."montantPaye" AS montant_paye,
      f."datePaiement" AS date_paiement,
      f."modePaiement" AS mode_paiement,
      COALESCE(r.s, '0') AS reglement_sum
    FROM factures f
    LEFT JOIN (
      SELECT "factureId", SUM(montant)::text AS s
      FROM reglements
      GROUP BY "factureId"
    ) r ON r."factureId" = f.id
    WHERE
      f.statut = 'payee'
      AND f."typeDocument" = 'facture'
      AND ROUND(f."montantPaye"::numeric, 2) > 0
      AND ROUND(COALESCE(r.s, '0')::numeric, 2) < ROUND(f."montantPaye"::numeric, 2) - 0.005
  `);

  console.log(`Factures à backfiller : ${rows.length}`);

  for (const row of rows) {
    const manquant = Number(row.montant_paye) - Number(row.reglement_sum ?? "0");
    if (manquant < 0.005) continue;

    const date = row.date_paiement ? row.date_paiement.split("T")[0] : new Date().toISOString().split("T")[0];
    const mode = toMode(row.mode_paiement);

    await pool.query(
      `INSERT INTO reglements ("factureId", "artisanId", montant, date, mode, reference, note, "createdAt")
       VALUES ($1, $2, $3, $4, $5, NULL, NULL, NOW())`,
      [row.id, row.artisan_id, manquant.toFixed(2), date, mode],
    );

    console.log(`  ✓ Facture #${row.id} — reglement ${manquant.toFixed(2)} ${mode} créé`);
  }

  console.log("Backfill terminé.");
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
