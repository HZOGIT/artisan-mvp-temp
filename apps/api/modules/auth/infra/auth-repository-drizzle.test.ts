import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { AuthRepositoryDrizzle } from "./auth-repository-drizzle";
import { ALL_PERMISSIONS } from "../../../../../packages/contract/permissions";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const U1 = 9943001;
const U2 = 9943002;

describe.skipIf(!URL)("AuthRepositoryDrizzle (PG : users HORS RLS, accès par id/email)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new AuthRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from users where id in ($1,$2)", [U1, U2]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, name, role, actif) values ($1,$2,$3,$4,'artisan',true)", [U1, "auth1@t.fr", "hash-bcrypt-xyz", "Jean"]);
    await admin.query("insert into users (id, email, password, role, actif) values ($1,$2,$3,'technicien',false)", [U2, "auth2@t.fr", "hash2"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("findCredentials : renvoie id/email/password/actif par email ; null si inconnu", async () => {
    const c = await repo.findCredentials("auth1@t.fr");
    expect(c).toMatchObject({ id: U1, email: "auth1@t.fr", password: "hash-bcrypt-xyz", actif: true });
    expect(await repo.findCredentials("nobody@t.fr")).toBeNull();
  });

  it("getById : utilisateur complet (sans hash) ; inactif renvoyé tel quel (actif=false)", async () => {
    const u = await repo.getById(U1);
    expect(u).toMatchObject({ id: U1, email: "auth1@t.fr", name: "Jean", role: "artisan", actif: true });
    expect((u as Record<string, unknown>).password).toBeUndefined();
    expect((await repo.getById(U2))?.actif).toBe(false);
    expect(await repo.getById(99999999)).toBeNull();
  });

  it("touchLastSignedIn : met à jour lastSignedIn", async () => {
    const before = (await admin.query('select "lastSignedIn" from users where id=$1', [U1])).rows[0].lastSignedIn;
    await new Promise((r) => setTimeout(r, 10));
    await repo.touchLastSignedIn(U1);
    const after = (await admin.query('select "lastSignedIn" from users where id=$1', [U1])).rows[0].lastSignedIn;
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it("FIX-CK — bootstrapAccount : crée artisan + abonnement trialing + subscription.created dans billing_events", async () => {
    const testUserId = 9943003;
    try {
      await admin.query("delete from users where id=$1", [testUserId]);
      await admin.query("insert into users (id, email, password, name, role, actif) values ($1,'ck@t.fr','hash','CK','artisan',true)", [testUserId]);
      await repo.bootstrapAccount(testUserId);
      const artisanRow = (await admin.query("select id from artisans where \"userId\"=$1", [testUserId])).rows[0];
      expect(artisanRow, "artisan créé").toBeDefined();
      const subRow = (await admin.query("select id, status, plan_id from billing_subscriptions where artisan_id=$1", [artisanRow.id])).rows[0];
      expect(subRow?.status).toBe("trialing");
      expect(subRow?.plan_id).toBe("starter");
      const evtRow = (await admin.query(
        "select event_type, entity_id, payload from billing_events where entity_type='billing_subscription' AND entity_id=$1 AND event_type='subscription.created'",
        [subRow.id],
      )).rows[0];
      expect(evtRow, "subscription.created dans billing_events").toBeDefined();
      expect(evtRow?.payload?.artisanId).toBe(artisanRow.id);
    } finally {
      await admin.query("delete from users where id=$1", [testUserId]);
    }
  });

  it("bootstrapAccount : owner reçoit TOUTES les permissions (incl utilisateurs.gerer)", async () => {
    const testUserId = 9943004;
    try {
      await admin.query("delete from users where id=$1", [testUserId]);
      await admin.query("insert into users (id, email, password, name, role, actif) values ($1,'bootstrap-perms@t.fr','hash','Owner','artisan',true)", [testUserId]);
      await repo.bootstrapAccount(testUserId);
      const { rows } = await admin.query<{ permission: string }>(
        "select permission from permissions_utilisateur where \"userId\"=$1 and autorise=true",
        [testUserId],
      );
      const granted = rows.map((r) => r.permission);
      for (const p of ALL_PERMISSIONS) {
        expect(granted, `permission manquante: ${p}`).toContain(p);
      }
    } finally {
      await admin.query("delete from users where id=$1", [testUserId]);
    }
  });

  it("bootstrapAccount : re-bootstrap idempotent (0 doublon)", async () => {
    const testUserId = 9943005;
    try {
      await admin.query("delete from users where id=$1", [testUserId]);
      await admin.query("insert into users (id, email, password, name, role, actif) values ($1,'idempotent@t.fr','hash','Idem','artisan',true)", [testUserId]);
      await repo.bootstrapAccount(testUserId);
      await repo.bootstrapAccount(testUserId);
      const { rows } = await admin.query<{ count: string }>(
        "select count(*) as count from permissions_utilisateur where \"userId\"=$1",
        [testUserId],
      );
      expect(Number(rows[0].count)).toBe(ALL_PERMISSIONS.length);
    } finally {
      await admin.query("delete from users where id=$1", [testUserId]);
    }
  });

  it("OPE-723 — createAndBootstrapUser : user.artisanId jamais null après inscription (atomicité)", async () => {
    const testEmail = "ope-723-atomic@t.fr";
    try {
      await admin.query("delete from users where email=$1", [testEmail]);
      const created = await repo.createAndBootstrapUser({ email: testEmail, passwordHash: "hash-atomic", name: "Atomique" });
      const u = await repo.getById(created.id);
      expect(u?.artisanId).not.toBeNull();
      const artisanRow = (await admin.query<{ id: number }>("select id from artisans where \"userId\"=$1", [created.id])).rows[0];
      expect(artisanRow?.id).toBe(u?.artisanId);
    } finally {
      await admin.query("delete from users where email=$1", [testEmail]);
    }
  });

  it("ALL_PERMISSIONS ne contient aucun doublon", () => {
    const unique = new Set(ALL_PERMISSIONS);
    expect(unique.size).toBe(ALL_PERMISSIONS.length);
  });

  it("OPE-737 — purgePersonalData : sub trialing SANS billing_cycle → supprimée", async () => {
    const testUserId = 9943006;
    try {
      await admin.query("delete from users where id=$1", [testUserId]);
      await admin.query("insert into users (id, email, password, name, role, actif) values ($1,'purge-nobill@t.fr','hash','Purge1','artisan',true)", [testUserId]);
      await repo.bootstrapAccount(testUserId);
      const artisanRow = (await admin.query<{ id: number }>("select id from artisans where \"userId\"=$1", [testUserId])).rows[0];
      const subBefore = (await admin.query<{ id: number }>("select id from billing_subscriptions where artisan_id=$1", [artisanRow.id])).rows[0];
      expect(subBefore, "sub créée par bootstrapAccount").toBeDefined();

      await repo.purgePersonalData(testUserId);

      const subAfter = (await admin.query("select id from billing_subscriptions where artisan_id=$1", [artisanRow.id])).rows[0];
      expect(subAfter, "sub supprimée par purgePersonalData").toBeUndefined();
      const evtAfter = (await admin.query("select id from billing_events where entity_type='billing_subscription' and entity_id=$1", [subBefore.id])).rows;
      expect(evtAfter, "billing_events supprimés").toHaveLength(0);
    } finally {
      await admin.query("delete from users where id=$1", [testUserId]);
    }
  });

  it("OPE-737 — purgePersonalData : sub AVEC billing_cycle → PRÉSERVÉE (historique réel)", async () => {
    const testUserId = 9943007;
    let subId: number | undefined;
    let cycleId: number | undefined;
    try {
      await admin.query("delete from users where id=$1", [testUserId]);
      await admin.query("insert into users (id, email, password, name, role, actif) values ($1,'purge-withbill@t.fr','hash','Purge2','artisan',true)", [testUserId]);
      await repo.bootstrapAccount(testUserId);
      const artisanRow = (await admin.query<{ id: number }>("select id from artisans where \"userId\"=$1", [testUserId])).rows[0];
      const subRow = (await admin.query<{ id: number }>("select id from billing_subscriptions where artisan_id=$1", [artisanRow.id])).rows[0];
      subId = subRow.id;

      const now = new Date();
      const cycleRow = (await admin.query<{ id: number }>(
        "insert into billing_cycles (subscription_id, period_start, period_end, amount_cents) values ($1,$2,$3,$4) returning id",
        [subId, now, new Date(now.getTime() + 30 * 86400_000), 1900],
      )).rows[0];
      cycleId = cycleRow.id;

      await repo.purgePersonalData(testUserId);

      const subAfter = (await admin.query("select id from billing_subscriptions where id=$1", [subId])).rows[0];
      expect(subAfter, "sub préservée (billing_cycle présent)").toBeDefined();
    } finally {
      if (cycleId) await admin.query("delete from billing_cycles where id=$1", [cycleId]);
      if (subId) await admin.query("delete from billing_events where entity_type='billing_subscription' and entity_id=$1", [subId]);
      if (subId) await admin.query("delete from billing_subscriptions where id=$1", [subId]);
      await admin.query("delete from users where id=$1", [testUserId]);
    }
  });

  it("OPE-817 — bootstrapAccount : initialise le plan comptable PCG (comptes clés présents)", async () => {
    const testUserId = 9943010;
    try {
      await admin.query("delete from users where id=$1", [testUserId]);
      await admin.query("insert into users (id, email, password, name, role, actif) values ($1,'pcg-bootstrap@t.fr','hash','PCG','artisan',true)", [testUserId]);
      await repo.bootstrapAccount(testUserId);
      const artisanRow = (await admin.query<{ id: number }>("select id from artisans where \"userId\"=$1", [testUserId])).rows[0];
      expect(artisanRow, "artisan créé").toBeDefined();

      const { rows } = await admin.query<{ "numeroCompte": string; type: string }>(
        "select \"numeroCompte\", type from plan_comptable where \"artisanId\"=$1 order by \"numeroCompte\"",
        [artisanRow.id],
      );
      const numeros = rows.map((r) => r["numeroCompte"]);
      expect(numeros, "411000 Clients").toContain("411000");
      expect(numeros, "706000 Prestations").toContain("706000");
      expect(numeros, "512000 Banque").toContain("512000");
      expect(numeros, "401000 Fournisseurs").toContain("401000");
      expect(numeros, "445711 TVA collectée 20%").toContain("445711");
      expect(numeros, "445660 TVA déductible").toContain("445660");
      expect(rows.find((r) => r["numeroCompte"] === "411000")?.type).toBe("actif");
      expect(rows.find((r) => r["numeroCompte"] === "706000")?.type).toBe("produit");
      expect(rows.find((r) => r["numeroCompte"] === "401000")?.type).toBe("passif");
    } finally {
      await admin.query("delete from users where id=$1", [testUserId]);
    }
  });

  it("OPE-817 — bootstrapAccount : plan comptable idempotent (re-bootstrap sans doublon)", async () => {
    const testUserId = 9943011;
    try {
      await admin.query("delete from users where id=$1", [testUserId]);
      await admin.query("insert into users (id, email, password, name, role, actif) values ($1,'pcg-idem@t.fr','hash','PCGIdem','artisan',true)", [testUserId]);
      await repo.bootstrapAccount(testUserId);
      await repo.bootstrapAccount(testUserId);
      const artisanRow = (await admin.query<{ id: number }>("select id from artisans where \"userId\"=$1", [testUserId])).rows[0];
      const { rows } = await admin.query<{ count: string }>(
        "select count(*) as count from plan_comptable where \"artisanId\"=$1",
        [artisanRow.id],
      );
      expect(Number(rows[0].count), "pas de doublon après double bootstrap").toBe(13);
    } finally {
      await admin.query("delete from users where id=$1", [testUserId]);
    }
  });

  it("OPE-817 — createAndBootstrapUser : plan comptable initialisé à l'inscription", async () => {
    const testEmail = "pcg-register@t.fr";
    try {
      await admin.query("delete from users where email=$1", [testEmail]);
      const created = await repo.createAndBootstrapUser({ email: testEmail, passwordHash: "hash-pcg", name: "NewUser" });
      const artisanRow = (await admin.query<{ id: number }>("select id from artisans where \"userId\"=$1", [created.id])).rows[0];
      expect(artisanRow, "artisan créé").toBeDefined();
      const { rows } = await admin.query<{ count: string }>(
        "select count(*) as count from plan_comptable where \"artisanId\"=$1",
        [artisanRow.id],
      );
      expect(Number(rows[0].count), "13 comptes PCG insérés").toBe(13);
    } finally {
      await admin.query("delete from users where email=$1", [testEmail]);
    }
  });

  it("OPE-992 — createAndBootstrapUser : permissions atomiques dans la tx principale (anti-régression fenêtre RLS)", async () => {
    /**
     * Anti-régression OPE-992 : l'INSERT permissions_utilisateur était best-effort HORS-tx
     * → échouait silencieusement quand FORCE RLS était actif sur la table.
     * Fix : permissions insérées dans la MÊME tx que user+artisan.
     * Ce test tourne sous app_tenant (APP_DATABASE_URL), pas owner — comme en prod.
     */
    const testEmail = "ope-992-permissions-atomic@t.fr";
    try {
      await admin.query("delete from users where email=$1", [testEmail]);
      const created = await repo.createAndBootstrapUser({ email: testEmail, passwordHash: "hash-ope992", name: "OPE992" });
      const { rows } = await admin.query<{ permission: string }>(
        "select permission from permissions_utilisateur where \"userId\"=$1 and autorise=true",
        [created.id],
      );
      const granted = rows.map((r) => r.permission);
      for (const p of ALL_PERMISSIONS) {
        expect(granted, `permission manquante après inscription : ${p}`).toContain(p);
      }
      expect(granted.length, "exactement ALL_PERMISSIONS sans doublon").toBe(ALL_PERMISSIONS.length);
    } finally {
      await admin.query("delete from users where email=$1", [testEmail]);
    }
  });
});
