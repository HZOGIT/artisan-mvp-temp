import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { BudgetCategorieRepositoryDrizzle } from "../../infra/budget-categorie-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const UA = 9946001;
const UB = 9946002;
let seq = 0;
const cat = () => `cat-${UA}-${++seq}`;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return app.inject({ method: "POST", url: `/api/trpc/${path}`, headers: { "content-type": "application/json", ...(tok ? { cookie: `token=${tok}` } : {}) }, payload: JSON.stringify(input) });
}
function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return app.inject({ method: "GET", url: `/api/trpc/${path}${qs}`, headers: tok ? { cookie: `token=${tok}` } : {} });
}

describe.skipIf(!URL)("budgetsCategories.router e2e (HTTP → tRPC → use-case → repo → RLS + unicité (categorie, mois))", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from budgets_categories where "artisan_id" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      await admin.query('insert into artisans ("userId") values ($1)', [uid]);
    }
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), budgetCategorieRepo: new BudgetCategorieRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → budgetsCategories.list 401", async () => {
    expect((await q(server, "budgetsCategories.list", undefined)).statusCode).toBe(401);
  });

  it("create + getById → défauts montants PG '0.00' + mapping", async () => {
    const tA = await token(UA);
    const created = await mut(server, "budgetsCategories.create", { categorie: cat(), mois: "2026-07" }, tA);
    expect(created.statusCode).toBe(200);
    const b = created.json().result.data as { id: number; artisanId: number; budget: string; depenseReelle: string };
    expect(b.budget).toBe("0.00");
    expect(b.depenseReelle).toBe("0.00");
    expect((await q(server, "budgetsCategories.getById", { id: b.id }, tA)).statusCode).toBe(200);
  });

  it("byMois filtre + scopé ([] pour un mois sans budget)", async () => {
    const tA = await token(UA);
    const c = cat();
    await mut(server, "budgetsCategories.create", { categorie: c, mois: "2026-03" }, tA);
    const rows = (await q(server, "budgetsCategories.byMois", { mois: "2026-03" }, tA)).json().result.data as { categorie: string }[];
    expect(rows.some((r) => r.categorie === c)).toBe(true);
    expect((await q(server, "budgetsCategories.byMois", { mois: "2030-01" }, tA)).json().result.data).toEqual([]);
  });

  it("INVARIANT unicité : 2e create même (categorie, mois) même tenant → 409 ; autre tenant → 200", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const c = cat();
    expect((await mut(server, "budgetsCategories.create", { categorie: c, mois: "2026-09" }, tA)).statusCode).toBe(200);
    expect((await mut(server, "budgetsCategories.create", { categorie: c, mois: "2026-09" }, tA)).statusCode).toBe(409);
    expect((await mut(server, "budgetsCategories.create", { categorie: c, mois: "2026-09" }, tB)).statusCode).toBe(200); // unicité par artisan
  });

  it("validations → 400 : categorie vide, mois mal formé, montant négatif", async () => {
    const tA = await token(UA);
    expect((await mut(server, "budgetsCategories.create", { categorie: "", mois: "2026-07" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "budgetsCategories.create", { categorie: cat(), mois: "2026-13" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "budgetsCategories.create", { categorie: cat(), mois: "2026-7" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "budgetsCategories.create", { categorie: cat(), mois: "2026-07", budget: "-5" }, tA)).statusCode).toBe(400);
  });

  it("update ne touche que les montants : categorie/mois envoyés sont ignorés (strippés)", async () => {
    const tA = await token(UA);
    const c = cat();
    const id = (await mut(server, "budgetsCategories.create", { categorie: c, mois: "2026-10", budget: "300.00" }, tA)).json().result.data.id as number;
    // categorie/mois hors updateSchema → strippés ; seuls les montants passent
    const maj = await mut(server, "budgetsCategories.update", { id, depenseReelle: "150.00", categorie: "HACK", mois: "2099-12" }, tA);
    expect(maj.statusCode).toBe(200);
    const b = maj.json().result.data as { categorie: string; mois: string; budget: string; depenseReelle: string };
    expect(b.depenseReelle).toBe("150.00");
    expect(b.budget).toBe("300.00"); // préservé
    expect(b.categorie).toBe(c); // immuable
    expect(b.mois).toBe("2026-10"); // immuable
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le budget de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await mut(server, "budgetsCategories.create", { categorie: cat(), mois: "2026-11" }, tA)).json().result.data.id as number;
    expect((await q(server, "budgetsCategories.getById", { id }, tB)).statusCode).toBe(404);
    expect((await mut(server, "budgetsCategories.update", { id, budget: "1.00" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "budgetsCategories.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "budgetsCategories.getById", { id }, tA)).statusCode).toBe(200);
  });

  it("delete OK propriétaire ; id inexistant → 404", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "budgetsCategories.create", { categorie: cat(), mois: "2026-12" }, tA)).json().result.data.id as number;
    expect((await mut(server, "budgetsCategories.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await q(server, "budgetsCategories.getById", { id }, tA)).statusCode).toBe(404);
    expect((await mut(server, "budgetsCategories.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });
});
