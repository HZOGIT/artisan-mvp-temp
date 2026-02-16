/**
 * Pre-migration script: fixes duplicate devis/facture numbers
 * Runs BEFORE drizzle-kit push to ensure unique index can be created
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function fixDuplicates() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log('[FixDuplicates] No DATABASE_URL, skipping'); process.exit(0); }

  const pool = mysql.createPool(url);

  try {
    // Find duplicate devis numbers per artisan
    const [dups] = await pool.execute(
      `SELECT artisanId, numero, GROUP_CONCAT(id ORDER BY id) as ids, COUNT(*) as cnt
       FROM devis GROUP BY artisanId, numero HAVING cnt > 1`
    ) as any;

    for (const dup of dups) {
      const ids = dup.ids.split(',').map(Number);
      // Keep the first one, renumber the rest
      for (let i = 1; i < ids.length; i++) {
        // Find next available number for this artisan
        const [maxRows] = await pool.execute(
          `SELECT MAX(numero) as maxNum FROM devis WHERE artisanId = ?`, [dup.artisanId]
        ) as any;
        let maxN = 0;
        if (maxRows[0]?.maxNum) {
          const match = maxRows[0].maxNum.match(/-(\d+)$/);
          if (match) maxN = parseInt(match[1], 10);
        }
        const newNum = `DEV-${String(maxN + 1).padStart(5, '0')}`;
        await pool.execute(`UPDATE devis SET numero = ? WHERE id = ?`, [newNum, ids[i]]);
        console.log(`[FixDuplicates] Devis id=${ids[i]}: ${dup.numero} → ${newNum}`);
      }
    }

    // Find duplicate facture numbers per artisan
    const [dupsFact] = await pool.execute(
      `SELECT artisanId, numero, GROUP_CONCAT(id ORDER BY id) as ids, COUNT(*) as cnt
       FROM factures GROUP BY artisanId, numero HAVING cnt > 1`
    ) as any;

    for (const dup of dupsFact) {
      const ids = dup.ids.split(',').map(Number);
      for (let i = 1; i < ids.length; i++) {
        const [maxRows] = await pool.execute(
          `SELECT MAX(numero) as maxNum FROM factures WHERE artisanId = ?`, [dup.artisanId]
        ) as any;
        let maxN = 0;
        if (maxRows[0]?.maxNum) {
          const match = maxRows[0].maxNum.match(/-(\d+)$/);
          if (match) maxN = parseInt(match[1], 10);
        }
        const newNum = `FAC-${String(maxN + 1).padStart(5, '0')}`;
        await pool.execute(`UPDATE factures SET numero = ? WHERE id = ?`, [newNum, ids[i]]);
        console.log(`[FixDuplicates] Facture id=${ids[i]}: ${dup.numero} → ${newNum}`);
      }
    }

    // Sync compteurDevis in parametres_artisan
    const [artisanRows] = await pool.execute(`SELECT DISTINCT artisanId FROM devis`) as any;
    for (const row of artisanRows) {
      const [maxRows] = await pool.execute(
        `SELECT MAX(numero) as maxNum FROM devis WHERE artisanId = ?`, [row.artisanId]
      ) as any;
      if (maxRows[0]?.maxNum) {
        const match = maxRows[0].maxNum.match(/-(\d+)$/);
        if (match) {
          const maxNum = parseInt(match[1], 10);
          await pool.execute(
            `UPDATE parametres_artisan SET compteurDevis = ? WHERE artisanId = ?`,
            [maxNum, row.artisanId]
          );
          console.log(`[FixDuplicates] Synced compteurDevis=${maxNum} for artisan ${row.artisanId}`);
        }
      }
    }

    // Sync compteurFacture
    const [artisanRowsF] = await pool.execute(`SELECT DISTINCT artisanId FROM factures`) as any;
    for (const row of artisanRowsF) {
      const [maxRows] = await pool.execute(
        `SELECT MAX(numero) as maxNum FROM factures WHERE artisanId = ?`, [row.artisanId]
      ) as any;
      if (maxRows[0]?.maxNum) {
        const match = maxRows[0].maxNum.match(/-(\d+)$/);
        if (match) {
          const maxNum = parseInt(match[1], 10);
          await pool.execute(
            `UPDATE parametres_artisan SET compteurFacture = ? WHERE artisanId = ?`,
            [maxNum, row.artisanId]
          );
          console.log(`[FixDuplicates] Synced compteurFacture=${maxNum} for artisan ${row.artisanId}`);
        }
      }
    }

    console.log('[FixDuplicates] Done.');
  } catch (e) {
    console.error('[FixDuplicates] Error:', e);
  } finally {
    await pool.end();
  }
}

fixDuplicates();
