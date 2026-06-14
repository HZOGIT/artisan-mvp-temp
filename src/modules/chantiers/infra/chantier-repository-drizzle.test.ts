import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ChantierRepositoryDrizzle } from "./chantier-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9930011;
const B = 9930012;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const ref = () => `CH-${A}-${++seq}`;

describe.skipIf(!URL)("ChantierRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ChantierRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from chantiers where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(async () => {
    await cleanup();
    // clientId est NOT NULL : on seed un client réel par tenant.
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Rénovation cuisine", budgetPrevisionnel: "15000.00" });
    expect(c.id).toBeGreaterThan(0);
    expect(c.artisanId).toBe(A);
    expect(c.statut).toBe("planifie"); // défaut PG
    expect(c.priorite).toBe("normale");
    expect(c.avancement).toBe(0);
    expect(c.budgetRealise).toBe("0.00");
    expect((await repo.getById(ctx(A), c.id))?.nom).toBe("Rénovation cuisine");
    expect((await repo.list(ctx(A))).some((x) => x.id === c.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le chantier de A", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), c.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === c.id)).toBe(false);
    expect(await repo.update(ctx(B), c.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), c.id)).toBe(false);
    expect((await repo.getById(ctx(A), c.id))?.nom).toBe("Secret");
  });

  it("update : modifie les champs fournis (dont avancement/statut), préserve les autres, scopé", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Avant", ville: "Lyon" });
    const maj = await repo.update(ctx(A), c.id, { nom: "Après", statut: "en_cours", avancement: 40 });
    expect(maj?.nom).toBe("Après");
    expect(maj?.statut).toBe("en_cours");
    expect(maj?.avancement).toBe(40);
    expect(maj?.ville).toBe("Lyon"); // champ non fourni préservé
  });

  it("delete : supprime le chantier, scopé", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "ASupprimer" });
    expect(await repo.delete(ctx(A), c.id)).toBe(true);
    expect(await repo.getById(ctx(A), c.id)).toBeNull();
  });

  it("ownsClient (anti-IDOR-FK) : un client est reconnu pour son tenant, pas pour un autre", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(B), clientA)).toBe(false); // client de A, vu depuis B
    expect(await repo.ownsClient(ctx(A), 987654321)).toBe(false); // inexistant
  });

  it("delete : cascade les sous-ressources (phases/documents…) — pas de lignes orphelines", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Avec sous-ressources" });
    await admin.query('insert into phases_chantier ("chantierId",nom) values ($1,$2),($1,$3)', [c.id, "Phase 1", "Phase 2"]);
    await admin.query('insert into documents_chantier ("chantierId",nom,url) values ($1,$2,$3)', [c.id, "Plan", "https://x/plan.pdf"]);
    expect(await repo.delete(ctx(A), c.id)).toBe(true);
    expect(await repo.getById(ctx(A), c.id)).toBeNull();
    const phases = await admin.query('select count(*)::int as n from phases_chantier where "chantierId"=$1', [c.id]);
    const docs = await admin.query('select count(*)::int as n from documents_chantier where "chantierId"=$1', [c.id]);
    expect(phases.rows[0].n).toBe(0);
    expect(docs.rows[0].n).toBe(0);
  });
});
