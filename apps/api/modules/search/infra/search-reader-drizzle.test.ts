import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { SearchReaderDrizzle } from "./search-reader-drizzle";
import { globalSearch } from "../application/use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9937001;
const B = 9937002;
const UA = 9937003;
const UB = 9937004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("SearchReaderDrizzle (PG, RLS + scope tenant cross-domaine)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new SearchReaderDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from fournisseurs where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [A, UA]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, UB]);
    const cA = (await admin.query('insert into clients ("artisanId",nom,prenom,email) values ($1,$2,$3,$4) returning id', [A, "Zorglub", "Jean", "zorglub@a.fr"])).rows[0].id;
    await admin.query('insert into devis ("artisanId","clientId",numero,objet,statut,"totalTTC") values ($1,$2,$3,$4,$5,$6)', [A, cA, "ZRG-1", "Chantier Zorglub", "envoye", "120.00"]);
    await admin.query('insert into clients ("artisanId",nom,prenom,email) values ($1,$2,$3,$4)', [B, "Zorglub", "Autre", "zorglub@b.fr"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("global : trouve client + devis du tenant A (ilike), projetés", async () => {
    const { results } = await globalSearch(reader, ctx(A), "zorglub");
    const types = results.map((r) => r.type).sort();
    expect(types).toContain("client");
    expect(types).toContain("devis");
    const client = results.find((r) => r.type === "client");
    expect(client?.title).toBe("Jean Zorglub");
    expect(client?.url).toBe(`/clients/${client?.id}`);
  });

  it("isolation : le tenant B ne voit que SON client « Zorglub », pas le devis de A", async () => {
    const { results } = await globalSearch(reader, ctx(B), "zorglub");
    expect(results.every((r) => r.type === "client")).toBe(true);
    expect(results.find((r) => r.type === "client")?.title).toBe("Autre Zorglub");
    expect(results.some((r) => r.type === "devis")).toBe(false);
  });
});
