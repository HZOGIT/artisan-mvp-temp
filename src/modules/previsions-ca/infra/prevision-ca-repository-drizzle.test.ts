import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { PrevisionCARepositoryDrizzle } from "./prevision-ca-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9946401;
const B = 9946402;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("PrevisionCARepositoryDrizzle (PG, RLS + camelCase)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new PrevisionCARepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from previsions_ca where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from historique_ca where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés ; défauts montants '0.00'", async () => {
    const p = await repo.create(ctx(A), { mois: 3, annee: 2026, caPrevisionnel: "1000.00" });
    expect(p.artisanId).toBe(A);
    expect(p.caPrevisionnel).toBe("1000.00");
    expect(p.caRealise).toBe("0.00");
    expect(p.confiance).toBeNull();
    expect(p.methodeCalcul).toBe("moyenne_mobile");
    expect((await repo.getById(ctx(A), p.id))?.mois).toBe(3);
    expect((await repo.list(ctx(A))).some((x) => x.id === p.id)).toBe(true);
    expect((await repo.listByAnnee(ctx(A), 2026)).some((x) => x.id === p.id)).toBe(true);
  });

  it("ecart négatif persisté correctement", async () => {
    const p = await repo.create(ctx(A), { mois: 4, annee: 2026, caPrevisionnel: "1000.00", caRealise: "800.00", ecart: "-200.00", ecartPourcentage: "-20.00" });
    const lu = await repo.getById(ctx(A), p.id);
    expect(lu?.ecart).toBe("-200.00");
    expect(lu?.ecartPourcentage).toBe("-20.00");
  });

  it("update ne modifie que montants/methode/confiance (mois/annee inchangés)", async () => {
    const p = await repo.create(ctx(A), { mois: 5, annee: 2026, caPrevisionnel: "500.00" });
    const maj = await repo.update(ctx(A), p.id, { caRealise: "450.00", confiance: "80.00", methodeCalcul: "manuel" });
    expect(maj?.caRealise).toBe("450.00");
    expect(maj?.confiance).toBe("80.00");
    expect(maj?.methodeCalcul).toBe("manuel");
    expect(maj?.caPrevisionnel).toBe("500.00"); // préservé
    expect(maj?.mois).toBe(5); // inchangé
    expect(maj?.annee).toBe(2026); // inchangé
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas la prévision de A", async () => {
    const p = await repo.create(ctx(A), { mois: 6, annee: 2026 });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), p.id));
    expect(await repo.update(ctx(B), p.id, { caRealise: "1.00" })).toBeNull();
    expect(await repo.delete(ctx(B), p.id)).toBe(false);
    expect((await repo.getById(ctx(A), p.id))?.id).toBe(p.id);
  });

  it("delete : supprime la prévision, scopé", async () => {
    const p = await repo.create(ctx(A), { mois: 7, annee: 2026 });
    expect(await repo.delete(ctx(A), p.id)).toBe(true);
    expect(await repo.getById(ctx(A), p.id)).toBeNull();
  });

  it("listHistorique : récent d'abord, borné, scopé tenant (RLS)", async () => {
    // historique_ca a un artisanId → RLS ; on seed via le pool admin.
    await admin.query('insert into historique_ca ("artisanId",mois,annee,"caTotal","nombreFactures","nombreClients","panierMoyen") values ($1,1,2026,$2,3,2,$3)', [A, "3000.00", "1000.00"]);
    await admin.query('insert into historique_ca ("artisanId",mois,annee,"caTotal") values ($1,12,2025,$2)', [A, "2500.00"]);
    await admin.query('insert into historique_ca ("artisanId",mois,annee,"caTotal") values ($1,11,2025,$2)', [A, "2000.00"]);
    await admin.query('insert into historique_ca ("artisanId",mois,annee,"caTotal") values ($1,1,2026,$2)', [B, "9999.00"]);
    const hist = await repo.listHistorique(ctx(A), 2);
    expect(hist.map((h) => `${h.annee}-${h.mois}`)).toEqual(["2026-1", "2025-12"]);
    expect(hist[0].caTotal).toBe("3000.00");
    expect(hist[0].nombreFactures).toBe(3);
    expect(hist[0].panierMoyen).toBe("1000.00");
    // isolation : B ne voit pas l'historique de A
    expect((await repo.listHistorique(ctx(B), 24)).every((h) => h.caTotal === "9999.00")).toBe(true);
  });
});
