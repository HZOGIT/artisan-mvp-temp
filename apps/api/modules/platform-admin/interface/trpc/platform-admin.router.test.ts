import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DrizzleUserRoleReader } from "../../../../shared/tenant/role-reader";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UID_USER = 9970001;
const UID_ADMIN_STAFF = 9970002;
const UID_ADMIN_TENANT = 9970003;

async function signToken(userId: number, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

/*
 * Un seul buildApp partagé entre tous les describe : évite la collision prom-client
 * ("process_cpu_user_seconds_total already registered") quand deux instances Fastify
 * co-existent dans le même processus vitest.
 */
const admin = new Pool({ connectionString: URL });
const appDb = createDbClient(APP_URL!);
const appPool = new Pool({ connectionString: APP_URL });
let server: ReturnType<typeof buildApp>;
const eventIds: number[] = [];
const llmUsageIds: number[] = [];

const UID_LLM_A = 9970010;
const UID_LLM_B = 9970011;

const purgeUser = async (uid: number) => {
  await admin.query('delete from artisans where "userId" = $1', [uid]);
  await admin.query("delete from users where id = $1", [uid]);
};

beforeAll(async () => {
  if (!URL) return;
  await purgeUser(UID_USER);
  await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID_USER, `u${UID_USER}@t.fr`]);
  await purgeUser(UID_ADMIN_STAFF);
  await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','admin')", [UID_ADMIN_STAFF, `u${UID_ADMIN_STAFF}@t.fr`]);
  await purgeUser(UID_ADMIN_TENANT);
  await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','admin')", [UID_ADMIN_TENANT, `u${UID_ADMIN_TENANT}@t.fr`]);
  await admin.query('insert into artisans ("userId") values ($1)', [UID_ADMIN_TENANT]);
  await purgeUser(UID_LLM_A);
  await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID_LLM_A, `u${UID_LLM_A}@t.fr`]);
  await admin.query('insert into artisans ("userId", "nomEntreprise") values ($1,$2)', [UID_LLM_A, "EntrepriseA"]);
  await purgeUser(UID_LLM_B);
  await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID_LLM_B, `u${UID_LLM_B}@t.fr`]);
  await admin.query('insert into artisans ("userId", "nomEntreprise") values ($1,$2)', [UID_LLM_B, "EntrepriseB"]);
  server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(appDb.db), roleReader: new DrizzleUserRoleReader(appDb.db) });
});

afterAll(async () => {
  if (!URL) return;
  if (eventIds.length) await admin.query("delete from events where id = any($1)", [eventIds]);
  if (llmUsageIds.length) await admin.query("delete from llm_usage where id = any($1)", [llmUsageIds]);
  await server?.close();
  for (const uid of [UID_USER, UID_ADMIN_STAFF, UID_ADMIN_TENANT, UID_LLM_A, UID_LLM_B]) await purgeUser(uid);
  await appDb.close();
  await appPool.end();
  await admin.end();
});

describe.skipIf(!URL)("platformAdmin.artisans.list L3", () => {
  it("sans cookie → 401", async () => {
    const res = await injectTrpc(server, "GET", "platformAdmin.artisans.list", {});
    expect(res.statusCode).toBe(401);
  });

  it("rôle artisan → 403", async () => {
    const tok = await signToken(UID_USER, `u${UID_USER}@t.fr`);
    const res = await injectTrpc(server, "GET", "platformAdmin.artisans.list", {}, tok);
    expect(res.statusCode).toBe(403);
  });

  it("rôle admin avec tenant résolu (artisanId) → 403", async () => {
    const tok = await signToken(UID_ADMIN_TENANT, `u${UID_ADMIN_TENANT}@t.fr`);
    const res = await injectTrpc(server, "GET", "platformAdmin.artisans.list", {}, tok);
    expect(res.statusCode).toBe(403);
  });

  it("rôle admin sans tenant → 200 + voit TOUS les artisans (cross-tenant)", async () => {
    const tok = await signToken(UID_ADMIN_STAFF, `u${UID_ADMIN_STAFF}@t.fr`);
    const res = await injectTrpc(server, "GET", "platformAdmin.artisans.list", {}, tok);
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { result: { data: { items: { id: number }[]; total: number } } }).result.data;
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe("number");
    const artisanRow = await admin.query<{ id: number }>('select id from artisans where "userId" = $1', [UID_ADMIN_TENANT]);
    const artisanId = artisanRow.rows[0]?.id;
    expect(artisanId).toBeDefined();
    expect(data.items.some((a) => a.id === artisanId)).toBe(true);
    expect(data.total).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!URL)("platformAdmin.llmUsage.summary L2+L3 — RLS llm_usage ouverte (0044)", () => {
  it("L2 — app_tenant voit les lignes cross-tenant (RLS désactivée)", async () => {
    const artisanA = await admin.query<{ id: number }>('select id from artisans where "userId" = $1', [UID_LLM_A]);
    const artisanB = await admin.query<{ id: number }>('select id from artisans where "userId" = $1', [UID_LLM_B]);
    const idA = artisanA.rows[0]!.id;
    const idB = artisanB.rows[0]!.id;

    const rA = await admin.query<{ id: number }>(
      "insert into llm_usage (artisan_id, use_case, model, prompt_tokens, response_tokens, total_tokens, duration_ms, finish_reason) values ($1,'test','claude-sonnet-4-6',100,50,150,200,'stop') returning id",
      [idA],
    );
    const rB = await admin.query<{ id: number }>(
      "insert into llm_usage (artisan_id, use_case, model, prompt_tokens, response_tokens, total_tokens, duration_ms, finish_reason) values ($1,'test','claude-sonnet-4-6',200,80,280,300,'stop') returning id",
      [idB],
    );
    llmUsageIds.push(rA.rows[0]!.id, rB.rows[0]!.id);

    const rows = await appPool.query<{ artisan_id: number; total_tokens: string }>(
      "select artisan_id, sum(total_tokens) as total_tokens from llm_usage where artisan_id = any($1) group by artisan_id",
      [[idA, idB]],
    );
    expect(rows.rows).toHaveLength(2);
    const totals = rows.rows.map((r) => Number(r.total_tokens));
    expect(totals).toContain(150);
    expect(totals).toContain(280);
  });

  it("L3 — staff admin voit le summary cross-tenant (les 2 artisans agrégés)", async () => {
    const tok = await signToken(UID_ADMIN_STAFF, `u${UID_ADMIN_STAFF}@t.fr`);
    const res = await injectTrpc(server, "GET", "platformAdmin.llmUsage.summary", {}, tok);
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { result: { data: { artisanId: number }[] } }).result.data;
    expect(Array.isArray(data)).toBe(true);
    const artisanA = await admin.query<{ id: number }>('select id from artisans where "userId" = $1', [UID_LLM_A]);
    const artisanB = await admin.query<{ id: number }>('select id from artisans where "userId" = $1', [UID_LLM_B]);
    const idA = artisanA.rows[0]!.id;
    const idB = artisanB.rows[0]!.id;
    expect(data.some((r) => r.artisanId === idA)).toBe(true);
    expect(data.some((r) => r.artisanId === idB)).toBe(true);
  });
});

describe.skipIf(!URL)("platformAdmin.events.list L2 — RLS events ouverte", () => {
  it("app_tenant peut insérer un event avec artisanId null (pas de WITH CHECK rejet)", async () => {
    /* ponytail: pool directe app_tenant — simule LoggingEventBus sans set_config('app.tenant') */
    const r = await appPool.query<{ id: number }>('insert into events ("entityType","entityId",action) values ($1,$2,$3) returning id', ["system", 0, "TEST_NULL_ARTISAN"]);
    expect(r.rows[0]!.id).toBeGreaterThan(0);
    eventIds.push(r.rows[0]!.id);
  });

  it("staff admin lit les events cross-tenant (artisanId null + artisan distinct)", async () => {
    const r1 = await admin.query<{ id: number }>('insert into events ("entityType","entityId",action,"artisanId") values ($1,$2,$3,$4) returning id', ["system", 0, "CROSS_TENANT_TEST", null]);
    const r2 = await admin.query<{ id: number }>('insert into events ("entityType","entityId",action,"artisanId") values ($1,$2,$3,$4) returning id', ["facture", 1, "CROSS_TENANT_TEST", 9999]);
    eventIds.push(r1.rows[0]!.id, r2.rows[0]!.id);

    const tok = await signToken(UID_ADMIN_STAFF, `u${UID_ADMIN_STAFF}@t.fr`);
    const res = await injectTrpc(server, "GET", "platformAdmin.events.list", { type: "CROSS_TENANT_TEST" }, tok);
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { result: { data: { items: { id: number }[]; total: number } } }).result.data;
    expect(data.items.length).toBeGreaterThanOrEqual(2);
    expect(data.total).toBeGreaterThanOrEqual(2);
  });
});
