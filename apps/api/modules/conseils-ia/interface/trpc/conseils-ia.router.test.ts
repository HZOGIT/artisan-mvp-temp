import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeLlmPort } from "../../../../shared/ports/fakes";
import { FakeModulesRepository } from "../../../feature-modules/infra/modules-repository-fake";
import { FakeSubscriptionReader, blankSub } from "../../../subscription/infra/subscription-reader-fake";
import type { ModuleCatalogue } from "../../../feature-modules/domain/module";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9959301;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

const ASSISTANT_IA_PRO: ModuleCatalogue = { id: 1, slug: "assistant_ia", label: "IA", description: null, icon: "x", categorie: "ia", planMinimum: "pro", actifParDefaut: false, ordre: 1 };

/* L3 e2e (HTTP → tRPC `conseilsIA`, procédure RACINE protégée). LLM faké (déterministe, offline). */
describe.skipIf(!URL)("conseilsIA procedure e2e (IA protégée)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise","metier") values ($1,$2,$3)', [UID, "Conseils SARL", "plombier"]);
    app = buildApp({ jwtSecret: SECRET, llm: new FakeLlmPort('[{"titre":"Relancez vos devis","description":"3 devis en attente"}]') });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("conseilsIA sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "conseilsIA", undefined)).statusCode).toBe(401);
  });

  it("conseilsIA (cookie) → 200, structure { conseils }", async () => {
    const res = await injectTrpc(app, "GET", "conseilsIA", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data?.conseils)).toBe(true);
  });
});

/* L3 gate plan — injecte des fakes modulesRepo + subscriptionRepo pour tester la gate sans DB. */
describe.skipIf(!URL)("conseilsIA gate plan (L3, fakes injectés)", () => {
  const admin = new Pool({ connectionString: URL });

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  let artisanId: number;

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    const r = await admin.query<{ id: number }>('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Test SARL"]);
    artisanId = r.rows[0]!.id;
  });

  afterAll(async () => {
    await cleanup();
    await admin.end();
  });

  it("plan starter + module pro → 403 FORBIDDEN", async () => {
    const modulesRepo = new FakeModulesRepository([ASSISTANT_IA_PRO]);
    const subscriptionRepo = new FakeSubscriptionReader();
    subscriptionRepo.seed(artisanId, { ...blankSub(artisanId), plan: "starter", status: "active", trialEndsAt: null });
    const app = buildApp({ jwtSecret: SECRET, llm: new FakeLlmPort("[]"), modulesRepo, subscriptionRepo });
    const res = await injectTrpc(app, "GET", "conseilsIA", undefined, await jwt(UID));
    await app.close();
    expect(res.statusCode).toBe(403);
  });

  it("plan pro + module pro → 200", async () => {
    const modulesRepo = new FakeModulesRepository([ASSISTANT_IA_PRO]);
    const subscriptionRepo = new FakeSubscriptionReader();
    subscriptionRepo.seed(artisanId, { ...blankSub(artisanId), plan: "pro", status: "active", trialEndsAt: null });
    const app = buildApp({ jwtSecret: SECRET, llm: new FakeLlmPort('[{"titre":"Conseil","description":"test"}]'), modulesRepo, subscriptionRepo });
    const res = await injectTrpc(app, "GET", "conseilsIA", undefined, await jwt(UID));
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data?.conseils)).toBe(true);
  });

  it("plan sans abonnement + module pro → 403 FORBIDDEN", async () => {
    const modulesRepo = new FakeModulesRepository([ASSISTANT_IA_PRO]);
    const subscriptionRepo = new FakeSubscriptionReader();
    const app = buildApp({ jwtSecret: SECRET, llm: new FakeLlmPort("[]"), modulesRepo, subscriptionRepo });
    const res = await injectTrpc(app, "GET", "conseilsIA", undefined, await jwt(UID));
    await app.close();
    expect(res.statusCode).toBe(403);
  });
});
