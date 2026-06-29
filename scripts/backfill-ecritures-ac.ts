/**
 * Backfill one-shot : génère les écritures AC manquantes dans ecritures_comptables pour toutes
 * les dépenses existantes sur 5433 (base déployée). NE PAS exécuter en production sans audit
 * préalable des données.
 *
 * Usage :
 *   DATABASE_URL=postgres://artisan_user:...@localhost:5433/artisan_mvp \
 *   APP_DATABASE_URL=postgres://app_tenant:...@localhost:5433/artisan_mvp \
 *   pnpm exec tsx scripts/backfill-ecritures-ac.ts
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { EcritureRepositoryDrizzle } from "../apps/api/modules/ecritures/infra/ecriture-repository-drizzle";
import { genererEcrituresAchat } from "../apps/api/modules/ecritures/application/generation-use-cases";
import type { TenantContext } from "../apps/api/shared/tenant";

const DB_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL ?? (DB_URL ? DB_URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

if (!DB_URL || !APP_URL) {
  console.error("DATABASE_URL et APP_DATABASE_URL requis");
  process.exit(1);
}

const admin = new Pool({ connectionString: DB_URL });
const appPool = new Pool({ connectionString: APP_URL });
const appDb = drizzle(appPool);

const ecritureRepo = new EcritureRepositoryDrizzle(appDb as never);

async function run(): Promise<void> {
  const depenses = await admin.query<{
    id: number; artisan_id: number; numero: string; date_depense: string;
    fournisseur: string | null; montant_ht: string; montant_tva: string | null;
    montant_ttc: string; tva_deductible: boolean; coeff_deductibilite: string;
    remboursable: boolean;
  }>(`SELECT id, artisan_id, numero, date_depense, fournisseur, montant_ht, montant_tva,
              montant_ttc, tva_deductible, coeff_deductibilite, remboursable
       FROM depenses ORDER BY artisan_id, id`);

  console.log(`Trouvé ${depenses.rows.length} dépenses à backfiller.`);

  let ok = 0, skipped = 0, errors = 0;
  for (const d of depenses.rows) {
    const ctx: TenantContext = { artisanId: d.artisan_id, userId: 0 };
    try {
      const ecr = await genererEcrituresAchat(ecritureRepo, ctx, {
        numero: d.numero,
        dateDepense: d.date_depense,
        fournisseur: d.fournisseur,
        montantHt: d.montant_ht,
        montantTva: d.montant_tva,
        montantTtc: d.montant_ttc,
        tvaDeductible: d.tva_deductible,
        coeffDeductibilite: d.coeff_deductibilite,
        remboursable: d.remboursable,
      });
      if (ecr.length > 0) { ok++; } else { skipped++; }
    } catch (err) {
      console.error(`Erreur dépense ${d.id} (${d.numero}):`, err);
      errors++;
    }
  }
  console.log(`Backfill terminé. Générées: ${ok}, ignorées (TTC=0): ${skipped}, erreurs: ${errors}.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await Promise.all([admin.end(), appPool.end()]); });
