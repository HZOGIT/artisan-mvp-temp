import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { VehiculeRepositoryDrizzle } from "./vehicule-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 991401;
const B = 991402;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 24 * 3600 * 1000).toISOString().slice(0, 10);

describe.skipIf(!URL)("vehicules — lectures dérivées flotte (entretiens à venir / assurances expirant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new VehiculeRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from entretiens_vehicules where "vehiculeId" in (select id from vehicules where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from assurances_vehicules where "vehiculeId" in (select id from vehicules where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from vehicules where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("listEntretiensAVenir : seulement les entretiens futurs du tenant", async () => {
    const vA = await repo.create(ctx(A), { immatriculation: "DR-A1" });
    await repo.addEntretien(ctx(A), vA.id, { type: "revision", dateEntretien: "2026-01-01", prochainEntretienDate: ymd(10) }); // futur
    await repo.addEntretien(ctx(A), vA.id, { type: "vidange", dateEntretien: "2026-01-01", prochainEntretienDate: ymd(-10) }); // passé
    const vB = await repo.create(ctx(B), { immatriculation: "DR-B1" });
    await repo.addEntretien(ctx(B), vB.id, { type: "freins", dateEntretien: "2026-01-01", prochainEntretienDate: ymd(5) }); // futur, tenant B

    const aVenir = await repo.listEntretiensAVenir(ctx(A));
    expect(aVenir.length).toBe(1);
    expect(aVenir[0].vehiculeId).toBe(vA.id);
    // B ne voit que le sien
    expect((await repo.listEntretiensAVenir(ctx(B))).length).toBe(1);
  });

  it("listAssurancesExpirant : seulement celles expirant sous N jours, du tenant", async () => {
    const vA = await repo.create(ctx(A), { immatriculation: "DR-A2" });
    await repo.addAssurance(ctx(A), vA.id, { compagnie: "Bientot", dateDebut: ymd(-300), dateFin: ymd(20) }); // expire dans 20j
    await repo.addAssurance(ctx(A), vA.id, { compagnie: "Loin", dateDebut: ymd(-10), dateFin: ymd(200) }); // expire loin
    const vB = await repo.create(ctx(B), { immatriculation: "DR-B2" });
    await repo.addAssurance(ctx(B), vB.id, { compagnie: "BientotB", dateDebut: ymd(-300), dateFin: ymd(15) }); // tenant B

    const expirant = await repo.listAssurancesExpirant(ctx(A), 30);
    expect(expirant.length).toBe(1);
    expect(expirant[0].compagnie).toBe("Bientot");
    // fenêtre plus courte n'inclut pas celle à 20j si < 20
    expect((await repo.listAssurancesExpirant(ctx(A), 10)).length).toBe(0);
    // B isolé
    expect((await repo.listAssurancesExpirant(ctx(B), 30)).map((a) => a.compagnie)).toEqual(["BientotB"]);
  });
});
