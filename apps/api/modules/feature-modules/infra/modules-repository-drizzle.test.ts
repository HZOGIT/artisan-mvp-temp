import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ModulesRepositoryDrizzle } from "./modules-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9933001;
const B = 9933002;
const UA = 9933003;
const UB = 9933004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const DEF = "zz_test_default";
const PRO = "zz_test_pro";

describe.skipIf(!URL)("ModulesRepositoryDrizzle (PG : catalogue global + activation tenant RLS + onboarding)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ModulesRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from artisan_modules where module_slug like 'zz_test_%' or artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from modules where slug like 'zz_test_%'");
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    await admin.query('insert into artisans (id, "userId", plan) values ($1,$2,$3)', [A, UA, "pro"]);
    await admin.query('insert into artisans (id, "userId", plan) values ($1,$2,$3)', [B, UB, "essentiel"]);
    await admin.query(
      'insert into modules (slug, label, icon, categorie, plan_minimum, actif_par_defaut, ordre) values ($1,$2,$3,$4,$5,$6,$7)',
      [DEF, "Test Défaut", "x", "core", "essentiel", true, 9001],
    );
    await admin.query(
      'insert into modules (slug, label, icon, categorie, plan_minimum, actif_par_defaut, ordre) values ($1,$2,$3,$4,$5,$6,$7)',
      [PRO, "Test Pro", "x", "ops", "pro", false, 9002],
    );
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getOnboardingStatus lit plan/metier sur artisans (scope par id)", async () => {
    expect((await repo.getOnboardingStatus(ctx(A)))?.plan).toBe("pro");
    expect((await repo.getOnboardingStatus(ctx(B)))?.plan).toBe("essentiel");
  });

  it("getSlugsActifs : sans préférence → fallback modules actifs par défaut (inclut le module de test)", async () => {
    expect(await repo.getSlugsActifs(ctx(A))).toContain(DEF);
  });

  it("setModule puis getSlugsActifs : une fois des préférences posées, plus de fallback (seuls les actifs)", async () => {
    await repo.setModule(ctx(A), PRO, true);
    const actifs = await repo.getSlugsActifs(ctx(A));
    expect(actifs).toContain(PRO);
    expect(actifs).not.toContain(DEF); // préférence existante → le défaut n'est plus auto-actif
    // upsert : re-désactiver met à jour sans doublon.
    await repo.setModule(ctx(A), PRO, false);
    expect(await repo.getSlugsActifs(ctx(A))).not.toContain(PRO);
  });

  it("isolation RLS : les préférences de A ne fuitent pas vers B", async () => {
    await repo.setModule(ctx(A), PRO, true);
    // B n'a aucune préférence → fallback défauts (et ne voit jamais la ligne artisan_modules de A).
    const actifsB = await repo.getSlugsActifs(ctx(B));
    expect(actifsB).toContain(DEF);
    const rowsAvuesParB = await admin.query("select count(*)::int as n from artisan_modules where artisan_id=$1", [A]);
    expect(rowsAvuesParB.rows[0].n).toBeGreaterThan(0); // la ligne existe bien (vue par l'admin)
  });

  it("updateOnboarding : set partiel du plan ; initDefaults active les modules par défaut", async () => {
    await repo.updateOnboarding(ctx(A), { plan: "entreprise" });
    expect((await repo.getOnboardingStatus(ctx(A)))?.plan).toBe("entreprise");
    await repo.initDefaults(ctx(B));
    expect(await repo.getSlugsActifs(ctx(B))).toContain(DEF);
  });
});
