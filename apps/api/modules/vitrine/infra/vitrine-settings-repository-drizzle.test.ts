import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { VitrineSettingsRepositoryDrizzle } from "./vitrine-settings-repository-drizzle";
import { DEFAULT_VITRINE_SETTINGS } from "../domain/vitrine-settings";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9947201;
const B = 9947202;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

// L2 : réglages vitrine (colonnes `vitrine*` de `parametres_artisan`, singleton par tenant, upsert idempotent).
// Double cloisonnement RLS + filtre `artisanId`. Vérifie défauts, upsert/reflux, MAJ partielle, isolation tenant.
describe.skipIf(!URL)("VitrineSettingsRepositoryDrizzle (PG, RLS + singleton vitrine get/update)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new VitrineSettingsRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from parametres_artisan where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("get sans ligne → réglages vitrine par défaut", async () => {
    expect(await repo.get(ctx(A))).toEqual(DEFAULT_VITRINE_SETTINGS);
  });

  it("update crée la ligne (upsert) puis re-get reflète l'état", async () => {
    const r = await repo.update(ctx(A), { vitrineActive: true, vitrineDescription: "Artisan de confiance", vitrineExperience: 12 });
    expect(r.vitrineActive).toBe(true);
    expect(r.vitrineDescription).toBe("Artisan de confiance");
    expect(r.vitrineExperience).toBe(12);
    const got = await repo.get(ctx(A));
    expect(got.vitrineActive).toBe(true);
    expect(got.vitrineDescription).toBe("Artisan de confiance");
  });

  it("MAJ partielle : ne touche que les champs fournis (description conservée)", async () => {
    await repo.update(ctx(A), { vitrineZone: "Lyon et alentours" });
    const got = await repo.get(ctx(A));
    expect(got.vitrineZone).toBe("Lyon et alentours");
    expect(got.vitrineDescription).toBe("Artisan de confiance"); // inchangé
  });

  it("isolation tenant : l'update de A ne fuit pas vers B (RLS)", async () => {
    expect(await repo.get(ctx(B))).toEqual(DEFAULT_VITRINE_SETTINGS);
  });
});
