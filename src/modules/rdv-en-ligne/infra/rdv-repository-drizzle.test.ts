import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { RdvRepositoryDrizzle } from "./rdv-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9944901;
const B = 9944902;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("RdvRepositoryDrizzle (PG, RLS + état machine + anti-IDOR clientId)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new RdvRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from rdv_en_ligne where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(async () => {
    await cleanup();
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const base = () => ({ clientId: clientA, titre: "Dépannage", dateProposee: new Date("2026-07-01T10:00:00Z") });

  it("create force artisanId + statut en_attente ; défauts PG (dureeEstimee/urgence)", async () => {
    const r = await repo.create(ctx(A), base());
    expect(r.artisanId).toBe(A);
    expect(r.statut).toBe("en_attente");
    expect(r.motifRefus).toBeNull();
    expect(r.dureeEstimee).toBe(60);
    expect(r.urgence).toBe("normale");
    expect((await repo.getById(ctx(A), r.id))?.titre).toBe("Dépannage");
    expect((await repo.list(ctx(A))).some((x) => x.id === r.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/transitionne/supprime pas le RDV de A", async () => {
    const r = await repo.create(ctx(A), base());
    await expectCrossTenantDenied(() => repo.getById(ctx(B), r.id));
    expect(await repo.update(ctx(B), r.id, { titre: "hack" })).toBeNull();
    expect(await repo.setStatut(ctx(B), r.id, "confirme")).toBeNull();
    expect(await repo.delete(ctx(B), r.id)).toBe(false);
    expect((await repo.getById(ctx(A), r.id))?.titre).toBe("Dépannage");
  });

  it("update ne modifie pas le statut ; setStatut applique confirme/refuse(motif)", async () => {
    const r = await repo.create(ctx(A), base());
    const maj = await repo.update(ctx(A), r.id, { titre: "Modifié", dureeEstimee: 90 });
    expect(maj?.titre).toBe("Modifié");
    expect(maj?.dureeEstimee).toBe(90);
    expect(maj?.statut).toBe("en_attente"); // inchangé
    const refuse = await repo.setStatut(ctx(A), r.id, "refuse", "Indisponible");
    expect(refuse?.statut).toBe("refuse");
    expect(refuse?.motifRefus).toBe("Indisponible");
  });

  it("ownsClient : true pour un client du tenant, false sinon (anti-IDOR)", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(A), clientB)).toBe(false); // client d'un autre tenant
    expect(await repo.ownsClient(ctx(A), 999999999)).toBe(false);
  });

  it("delete : supprime le RDV, scopé", async () => {
    const r = await repo.create(ctx(A), base());
    expect(await repo.delete(ctx(A), r.id)).toBe(true);
    expect(await repo.getById(ctx(A), r.id)).toBeNull();
  });
});
