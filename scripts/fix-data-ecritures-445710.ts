/**
 * One-shot : corrige l'écriture TVA générique 445710 (id=3, FAC-00004, artisanId=1).
 * OPE-755 — ancienne version du code avant ventilation par taux.
 *
 * Usage (BDD déployée, port 5433) :
 *   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5433/artisan_mvp \
 *     pnpm exec tsx scripts/fix-data-ecritures-445710.ts
 *
 * Idempotent : ne fait rien si l'id=3 n'existe plus ou n'est plus 445710.
 */
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");

const db = new Pool({ connectionString: url });

try {
  const existing = await db.query<{ id: number; "numeroCompte": string; credit: string }>(
    'SELECT id, "numeroCompte", credit FROM ecritures_comptables WHERE id = 3',
  );
  const row = existing.rows[0];
  if (!row) { console.log("id=3 absent — rien à faire"); process.exit(0); }
  if (row.numeroCompte !== "445710") {
    console.log(`id=3 est déjà sur le compte ${row.numeroCompte} — rien à faire`);
    process.exit(0);
  }

  await db.query("BEGIN");

  await db.query("DELETE FROM ecritures_comptables WHERE id = 3");

  await db.query(
    `INSERT INTO ecritures_comptables
       ("artisanId","dateEcriture",journal,"numeroCompte","libelleCompte",libelle,"pieceRef",debit,credit,"factureId",statut)
     VALUES
       (1,'2026-06-09','VE','445711','TVA collectée 20%','Facture FAC-00004','FAC-00004','0.00','740.00',4,'brouillon'),
       (1,'2026-06-09','VE','445712','TVA collectée 10%','Facture FAC-00004','FAC-00004','0.00','579.00',4,'brouillon')`,
  );

  await db.query("COMMIT");
  console.log("OK : écriture 445710 remplacée par 445711 (740.00) + 445712 (579.00) pour FAC-00004");
} catch (e) {
  await db.query("ROLLBACK").catch(() => null);
  console.error("ERREUR :", e);
  process.exit(1);
} finally {
  await db.end();
}
