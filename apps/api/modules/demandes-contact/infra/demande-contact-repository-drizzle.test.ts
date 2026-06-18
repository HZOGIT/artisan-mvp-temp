import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DemandeContactRepositoryDrizzle } from "./demande-contact-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9945701;
const B = 9945702;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("DemandeContactRepositoryDrizzle (PG, RLS + état machine + anti-IDOR conversion)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new DemandeContactRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from demandes_contact where "artisanId" in ($1,$2)', [A, B]);
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

  it("create force artisanId + statut nouveau + clientId null ; source défaut PG", async () => {
    const d = await repo.create(ctx(A), { nom: "Jean Dupont", email: "jean@test.fr" });
    expect(d.artisanId).toBe(A);
    expect(d.statut).toBe("nouveau");
    expect(d.clientId).toBeNull();
    expect(d.source).toBe("vitrine");
    expect((await repo.getById(ctx(A), d.id))?.nom).toBe("Jean Dupont");
    expect((await repo.list(ctx(A))).some((x) => x.id === d.id)).toBe(true);
    expect((await repo.listByStatut(ctx(A), "nouveau")).some((x) => x.id === d.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/transitionne/supprime pas la demande de A", async () => {
    const d = await repo.create(ctx(A), { nom: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), d.id));
    expect(await repo.update(ctx(B), d.id, { nom: "hack" })).toBeNull();
    expect(await repo.setStatut(ctx(B), d.id, "perdu")).toBeNull();
    expect(await repo.delete(ctx(B), d.id)).toBe(false);
    expect((await repo.getById(ctx(A), d.id))?.nom).toBe("Secret");
  });

  it("update ne modifie pas le statut/clientId ; setStatut applique contacte/converti(+clientId)", async () => {
    const d = await repo.create(ctx(A), { nom: "Jean" });
    const maj = await repo.update(ctx(A), d.id, { nom: "Jean Modifié", telephone: "0600000000" });
    expect(maj?.nom).toBe("Jean Modifié");
    expect(maj?.statut).toBe("nouveau"); // inchangé
    expect(maj?.clientId).toBeNull();
    expect((await repo.setStatut(ctx(A), d.id, "contacte"))?.statut).toBe("contacte");
    const converti = await repo.setStatut(ctx(A), d.id, "converti", clientA);
    expect(converti?.statut).toBe("converti");
    expect(converti?.clientId).toBe(clientA);
  });

  it("ownsClient : true pour un client du tenant, false sinon (anti-IDOR conversion)", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(A), clientB)).toBe(false);
    expect(await repo.ownsClient(ctx(A), 999999999)).toBe(false);
  });

  it("delete : supprime la demande, scopé", async () => {
    const d = await repo.create(ctx(A), { nom: "ASupprimer" });
    expect(await repo.delete(ctx(A), d.id)).toBe(true);
    expect(await repo.getById(ctx(A), d.id)).toBeNull();
  });
});
