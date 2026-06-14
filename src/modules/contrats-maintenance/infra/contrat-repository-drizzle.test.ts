import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ContratRepositoryDrizzle } from "./contrat-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9945501;
const B = 9945502;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("ContratRepositoryDrizzle (PG, RLS + état machine + anti-IDOR + référence serveur)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ContratRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from contrats_maintenance where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(async () => {
    await cleanup();
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [A, "CA"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [B, "CB"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const base = () => ({ clientId: clientA, titre: "Entretien chaudière", montantHT: "300.00", periodicite: "annuel" as const, dateDebut: new Date("2026-07-01T00:00:00Z") });

  it("create force artisanId + statut actif + reference fournie ; défauts PG", async () => {
    const ref = await repo.nextReference(ctx(A));
    const c = await repo.create(ctx(A), base(), ref);
    expect(c.artisanId).toBe(A);
    expect(c.statut).toBe("actif");
    expect(c.reference).toBe(ref);
    expect(c.type).toBe("entretien");
    expect(c.tauxTVA).toBe("20.00");
    expect(c.reconduction).toBe(true);
    expect((await repo.getById(ctx(A), c.id))?.titre).toBe("Entretien chaudière");
    expect((await repo.list(ctx(A))).some((x) => x.id === c.id)).toBe(true);
  });

  it("nextReference incrémente (borne sur l'existant)", async () => {
    const r1 = await repo.nextReference(ctx(A));
    await repo.create(ctx(A), base(), r1);
    const r2 = await repo.nextReference(ctx(A));
    expect(parseInt(r2.match(/-(\d+)$/)![1], 10)).toBe(parseInt(r1.match(/-(\d+)$/)![1], 10) + 1);
  });

  it("isolation cross-tenant : B ne lit/modifie/transitionne/supprime pas le contrat de A", async () => {
    const c = await repo.create(ctx(A), base(), await repo.nextReference(ctx(A)));
    await expectCrossTenantDenied(() => repo.getById(ctx(B), c.id));
    expect(await repo.update(ctx(B), c.id, { titre: "hack" })).toBeNull();
    expect(await repo.setStatut(ctx(B), c.id, "annule")).toBeNull();
    expect(await repo.delete(ctx(B), c.id)).toBe(false);
    expect((await repo.getById(ctx(A), c.id))?.titre).toBe("Entretien chaudière");
  });

  it("update ne modifie pas le statut ; setStatut applique suspendu/termine", async () => {
    const c = await repo.create(ctx(A), base(), await repo.nextReference(ctx(A)));
    const maj = await repo.update(ctx(A), c.id, { titre: "Modifié", montantHT: "350.00" });
    expect(maj?.titre).toBe("Modifié");
    expect(maj?.montantHT).toBe("350.00");
    expect(maj?.statut).toBe("actif");
    expect((await repo.setStatut(ctx(A), c.id, "suspendu"))?.statut).toBe("suspendu");
    expect((await repo.setStatut(ctx(A), c.id, "termine"))?.statut).toBe("termine");
  });

  it("ownsClient : true pour client du tenant, false sinon (anti-IDOR)", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(A), clientB)).toBe(false);
    expect(await repo.ownsClient(ctx(A), 999999999)).toBe(false);
  });
});
