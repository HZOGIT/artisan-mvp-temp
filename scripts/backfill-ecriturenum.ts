/**
 * Backfill one-shot OPE-841 : assigne ecritureNum aux écritures existantes avec ecritureNum IS NULL.
 * Cible : base déployée 5433 (staging). Non inclus dans les migrations.
 *
 * Usage :
 *   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5433/artisan_mvp \
 *   pnpm exec tsx scripts/backfill-ecriturenum.ts
 *
 * Logique :
 *   - Pour chaque (artisanId, exercice=YEAR(dateEcriture)), groupe les écritures NULL en pièces
 *     (factureId+journal ou pieceRef+journal), triées chronologiquement (dateEcriture ASC, id ASC).
 *   - Assigne des ecritureNum séquentiels par pièce, à partir de MAX existant pour ce (artisanId, exercice) + 1.
 *   - Idempotent : ne touche que les lignes avec ecritureNum IS NULL.
 */
import { Pool } from "pg";

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error("DATABASE_URL requis");
  process.exit(1);
}

type Row = {
  id: number;
  artisanId: number;
  dateEcriture: Date;
  journal: string;
  factureId: number | null;
  pieceRef: string | null;
};

type MaxRow = { artisanId: number; exercice: number; maxNum: number | null };

async function main() {
  const pool = new Pool({ connectionString: URL });
  try {
    const { rows } = await pool.query<Row>(
      `SELECT id, "artisanId", "dateEcriture", journal, "factureId", "pieceRef"
       FROM ecritures_comptables
       WHERE "ecritureNum" IS NULL
       ORDER BY "artisanId" ASC, "dateEcriture" ASC, id ASC`,
    );

    if (rows.length === 0) {
      console.log("Aucune écriture sans ecritureNum — rien à faire.");
      return;
    }
    console.log(`${rows.length} écritures sans ecritureNum.`);

    /* MAX existants par (artisanId, exercice) pour éviter les collisions */
    const { rows: maxRows } = await pool.query<MaxRow>(
      `SELECT "artisanId", EXTRACT(YEAR FROM "dateEcriture")::int AS exercice, MAX("ecritureNum") AS "maxNum"
       FROM ecritures_comptables
       WHERE "ecritureNum" IS NOT NULL
       GROUP BY "artisanId", EXTRACT(YEAR FROM "dateEcriture")::int`,
    );
    const maxByKey = new Map<string, number>();
    for (const r of maxRows) {
      maxByKey.set(`${r.artisanId}:${r.exercice}`, r.maxNum ?? 0);
    }

    /* Grouper les NULL par (artisanId, exercice) puis en pièces */
    type GroupKey = string;
    const groups = new Map<GroupKey, Row[]>();
    for (const r of rows) {
      const exercice = new Date(r.dateEcriture).getFullYear();
      const key = `${r.artisanId}:${exercice}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    let totalUpdated = 0;
    for (const [key, lignes] of groups) {
      const [artisanId, exercice] = key.split(":").map(Number);
      let nextNum = (maxByKey.get(key) ?? 0) + 1;

      /* Grouper en pièces : (factureId, journal) ou (pieceRef, journal) */
      const pieceNums = new Map<string, number>();
      const updates: Array<{ id: number; ecritureNum: number }> = [];
      for (const l of lignes) {
        const clePiece = l.factureId != null
          ? `${l.factureId}|${l.journal}`
          : `P:${l.pieceRef ?? ""}|${l.journal}`;
        if (!pieceNums.has(clePiece)) {
          pieceNums.set(clePiece, nextNum++);
        }
        updates.push({ id: l.id, ecritureNum: pieceNums.get(clePiece)! });
      }

      /* Mise à jour par lot */
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const u of updates) {
          await client.query(
            'UPDATE ecritures_comptables SET "ecritureNum" = $1 WHERE id = $2',
            [u.ecritureNum, u.id],
          );
        }
        await client.query("COMMIT");
        totalUpdated += updates.length;
        console.log(`  artisan=${artisanId} exercice=${exercice} → ${updates.length} écritures, nums ${(maxByKey.get(key) ?? 0) + 1}..${nextNum - 1}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`Done — ${totalUpdated} écritures mises à jour.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
