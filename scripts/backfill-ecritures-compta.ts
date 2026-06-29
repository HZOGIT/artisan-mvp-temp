/**
 * Backfill one-shot OPE-753/OPE-754 : génère les écritures VE/BQ manquantes et valide
 * toutes les écritures en statut brouillon. Cible : base déployée (5433).
 * Non inclus dans les migrations Drizzle (one-shot staging uniquement).
 * Usage : DATABASE_URL=... APP_DATABASE_URL=... pnpm exec tsx scripts/backfill-ecritures-compta.ts
 */
import { Pool } from "pg";
import { createDbClient } from "../apps/api/shared/db";
import { EcritureRepositoryDrizzle } from "../apps/api/modules/ecritures/infra/ecriture-repository-drizzle";
import { FactureReaderDrizzle } from "../apps/api/modules/ecritures/infra/facture-reader-drizzle";
import { genererEcrituresVente, genererEcrituresEncaissement, validerEcritures } from "../apps/api/modules/ecritures/application/generation-use-cases";
import type { TenantContext } from "../apps/api/shared/tenant";

const ADMIN_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;

if (!ADMIN_URL || !APP_URL) {
  console.error("DATABASE_URL et APP_DATABASE_URL requis");
  process.exit(1);
}

async function main() {
  const adminPool = new Pool({ connectionString: ADMIN_URL });
  const { db, close } = createDbClient(APP_URL!);
  const ecritureRepo = new EcritureRepositoryDrizzle(db);
  const factureReader = new FactureReaderDrizzle(db);

  const { rows: factures } = await adminPool.query<{ id: number; artisanId: number; statut: string }>(
    `SELECT id, "artisanId", statut FROM factures WHERE statut IN ('envoyee','payee','en_retard','validee') ORDER BY id`,
  );

  console.log(`${factures.length} factures à traiter`);
  let veGen = 0; let bqGen = 0; let validated = 0;

  for (const f of factures) {
    const ctx: TenantContext = { artisanId: f.artisanId, userId: 0 };
    const ve = await genererEcrituresVente(ecritureRepo, factureReader, ctx, f.id);
    if (ve.length > 0) {
      veGen++;
      console.log(`  VE générée facture ${f.id} (${f.statut})`);
    }
    if (f.statut === "payee") {
      const bq = await genererEcrituresEncaissement(ecritureRepo, factureReader, ctx, f.id);
      if (bq.length > 0) {
        bqGen++;
        console.log(`  BQ générée facture ${f.id}`);
      }
    }
    const n = await validerEcritures(ecritureRepo, ctx, f.id);
    validated += n;
  }

  console.log(`Done — VE générées: ${veGen} | BQ générées: ${bqGen} | écritures verrouillées: ${validated}`);
  await close();
  await adminPool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
