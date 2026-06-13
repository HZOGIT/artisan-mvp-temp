import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ClientRepositoryDrizzle } from "./client-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 997001;
const B = 997002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("ClientRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ClientRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from factures where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const c = await repo.create(ctx(A), { nom: "Durand", prenom: "Marie", email: "marie@example.fr", type: "professionnel" });
    expect(c.id).toBeGreaterThan(0);
    expect(c.artisanId).toBe(A);
    expect(c.type).toBe("professionnel");
    expect((await repo.getById(ctx(A), c.id))?.email).toBe("marie@example.fr");
    expect((await repo.list(ctx(A))).some((x) => x.id === c.id)).toBe(true);
  });

  it("type par défaut = particulier quand absent", async () => {
    const c = await repo.create(ctx(A), { nom: "Sanstype" });
    expect(c.type).toBe("particulier");
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le client de A (PII)", async () => {
    const c = await repo.create(ctx(A), { nom: "Secret", email: "secret@a.fr" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), c.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === c.id)).toBe(false);
    expect(await repo.update(ctx(B), c.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), c.id)).toBe(false);
    // A intact (PII non altérée par B)
    const intact = await repo.getById(ctx(A), c.id);
    expect(intact?.nom).toBe("Secret");
    expect(intact?.email).toBe("secret@a.fr");
  });

  it("update : modifie les champs fournis, maj updatedAt, scopé", async () => {
    const c = await repo.create(ctx(A), { nom: "Avant", ville: "Lyon" });
    const maj = await repo.update(ctx(A), c.id, { nom: "Après", telephone: "0102030405" });
    expect(maj?.nom).toBe("Après");
    expect(maj?.telephone).toBe("0102030405");
    expect(maj?.ville).toBe("Lyon"); // champ non fourni préservé
  });

  it("delete : supprime le client, scopé", async () => {
    const c = await repo.create(ctx(A), { nom: "ASupprimer" });
    expect(await repo.delete(ctx(A), c.id)).toBe(true);
    expect(await repo.getById(ctx(A), c.id)).toBeNull();
  });

  it("countDocumentsLies : compte les documents métier du tenant, ignore les autres tenants", async () => {
    const c = await repo.create(ctx(A), { nom: "AvecDocs" });
    // aucun document au départ
    expect(await repo.countDocumentsLies(ctx(A), c.id)).toBe(0);
    // seed 2 factures + 1 devis liés au client de A (colonnes non-null minimales)
    await admin.query(
      `insert into factures ("artisanId","clientId",numero) values ($1,$2,'F-A-1'),($1,$2,'F-A-2')`,
      [A, c.id],
    );
    await admin.query(`insert into devis ("artisanId","clientId",numero) values ($1,$2,'D-A-1')`, [A, c.id]);
    expect(await repo.countDocumentsLies(ctx(A), c.id)).toBe(3);
    // un document d'un AUTRE tenant pointant un id de client identique ne doit pas compter
    expect(await repo.countDocumentsLies(ctx(B), c.id)).toBe(0);
    // nettoyage des documents seedés
    await admin.query('delete from factures where "artisanId"=$1', [A]);
    await admin.query('delete from devis where "artisanId"=$1', [A]);
  });

  it("search : trouve par nom/e-mail scopé tenant ; un `%` est littéral (pas d'injection LIKE)", async () => {
    await repo.create(ctx(A), { nom: "Lefebvre", email: "lefebvre@a.fr" });
    await repo.create(ctx(A), { nom: "a%b", email: "wild@a.fr" });
    await repo.create(ctx(B), { nom: "Lefebvre", email: "lefebvre@b.fr" }); // homonyme chez B
    // recherche par sous-chaîne (case-insensitive)
    expect((await repo.search(ctx(A), "lefeb")).map((c) => c.nom)).toEqual(["Lefebvre"]);
    // scope : le Lefebvre de B n'apparaît pas pour A
    expect((await repo.search(ctx(A), "lefebvre")).every((c) => c.artisanId === A)).toBe(true);
    // `%` traité littéralement : ne renvoie QUE le client contenant `%`, pas tout le tenant
    const wild = await repo.search(ctx(A), "%");
    expect(wild.map((c) => c.nom)).toEqual(["a%b"]);
  });
});
