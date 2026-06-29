import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeLlmPort } from "../../../../shared/ports/fakes";
import { FakeModulesRepository } from "../../../feature-modules/infra/modules-repository-fake";
import { FakeSubscriptionReader, blankSub } from "../../../subscription/infra/subscription-reader-fake";
import { noopLlmTracker } from "../../../../shared/ports/llm-usage-tracker";
import type { ModuleCatalogue } from "../../../feature-modules/domain/module";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID_STARTER = 9959301;
const UID_PRO = 9959302;
const UID_NONE = 9959303;
const UIDS = [UID_STARTER, UID_PRO, UID_NONE];

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

const ASSISTANT_IA_PRO: ModuleCatalogue = { id: 1, slug: "assistant_ia", label: "IA", description: null, icon: "x", categorie: "ia", planMinimum: "pro", actifParDefaut: false, ordre: 1 };

/*
 * L3 e2e (HTTP → tRPC `conseilsIA`). LLM faké (déterministe, offline).
 * Gate plan testée via fakes injectés (modulesRepo + subscriptionRepo) : une seule instance d'app
 * pour éviter la double-registration prom-client (fastify-metrics → collectDefaultMetrics global).
 * 3 artisans seeded : starter → 403, pro → 200, sans abonnement → 403.
 */
describe.skipIf(!URL)("conseilsIA procedure e2e (IA protégée + gate plan)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  const artisanIds: Record<number, number> = {};

  const cleanup = async () => {
    await admin.query(
      `delete from llm_usage where artisan_id in (select id from artisans where "userId" = any($1::bigint[]))`,
      [UIDS],
    );
    await admin.query('delete from artisans where "userId" = any($1::bigint[])', [UIDS]);
    await admin.query("delete from users where id = any($1::bigint[])", [UIDS]);
  };

  beforeAll(async () => {
    await cleanup();
    for (const uid of UIDS) {
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      const r = await admin.query<{ id: number }>('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [uid, `Artisan ${uid}`]);
      artisanIds[uid] = r.rows[0]!.id;
    }

    const modulesRepo = new FakeModulesRepository([ASSISTANT_IA_PRO]);
    const subscriptionRepo = new FakeSubscriptionReader();
    subscriptionRepo.seed(artisanIds[UID_STARTER]!, { ...blankSub(artisanIds[UID_STARTER]!), plan: "starter", status: "active", trialEndsAt: null });
    subscriptionRepo.seed(artisanIds[UID_PRO]!, { ...blankSub(artisanIds[UID_PRO]!), plan: "pro", status: "active", trialEndsAt: null });

    app = buildApp({
      jwtSecret: SECRET,
      llm: new FakeLlmPort('[{"titre":"Relancez vos devis","description":"3 devis en attente"}]'),
      trackLlm: noopLlmTracker,
      modulesRepo,
      subscriptionRepo,
    });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("conseilsIA sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "conseilsIA", undefined)).statusCode).toBe(401);
  });

  it("plan starter + module pro → 403 FORBIDDEN", async () => {
    const res = await injectTrpc(app, "GET", "conseilsIA", undefined, await jwt(UID_STARTER));
    expect(res.statusCode).toBe(403);
  });

  it("plan pro + module pro → 200", async () => {
    const res = await injectTrpc(app, "GET", "conseilsIA", undefined, await jwt(UID_PRO));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data?.conseils)).toBe(true);
  });

  it("sans abonnement + module pro → 403 FORBIDDEN", async () => {
    const res = await injectTrpc(app, "GET", "conseilsIA", undefined, await jwt(UID_NONE));
    expect(res.statusCode).toBe(403);
  });
});
