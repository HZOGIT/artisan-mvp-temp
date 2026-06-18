import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { PrevisionCARepositoryDrizzle } from "../../infra/prevision-ca-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const UA = 9946501;
const UB = 9946502;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

describe.skipIf(!URL)("previsions.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from previsions_ca where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      await admin.query('insert into artisans ("userId") values ($1)', [uid]);
    }
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), previsionCARepo: new PrevisionCARepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → previsions.list 401", async () => {
    expect((await q(server, "previsions.list", undefined)).statusCode).toBe(401);
  });

  it("create + getById → défauts montants '0.00' + confiance null", async () => {
    const tA = await token(UA);
    const created = await mut(server, "previsions.create", { mois: 3, annee: 2026 }, tA);
    expect(created.statusCode).toBe(200);
    const p = created.json().result.data as { id: number; caPrevisionnel: string; caRealise: string; confiance: string | null };
    expect(p.caPrevisionnel).toBe("0.00");
    expect(p.caRealise).toBe("0.00");
    expect(p.confiance).toBeNull();
    expect((await q(server, "previsions.getById", { id: p.id }, tA)).statusCode).toBe(200);
  });

  it("byAnnee filtre + scopé ([] pour une année sans prévision)", async () => {
    const tA = await token(UA);
    await mut(server, "previsions.create", { mois: 8, annee: 2024 }, tA);
    const rows = (await q(server, "previsions.byAnnee", { annee: 2024 }, tA)).json().result.data as { mois: number }[];
    expect(rows.some((r) => r.mois === 8)).toBe(true);
    expect((await q(server, "previsions.byAnnee", { annee: 2099 }, tA)).json().result.data).toEqual([]);
  });

  it("validations → 400 : mois hors 1-12, annee hors bornes, montant négatif, confiance > 100", async () => {
    const tA = await token(UA);
    expect((await mut(server, "previsions.create", { mois: 0, annee: 2026 }, tA)).statusCode).toBe(400);
    expect((await mut(server, "previsions.create", { mois: 13, annee: 2026 }, tA)).statusCode).toBe(400);
    expect((await mut(server, "previsions.create", { mois: 3, annee: 1999 }, tA)).statusCode).toBe(400);
    expect((await mut(server, "previsions.create", { mois: 3, annee: 2026, caPrevisionnel: "-5.00" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "previsions.create", { mois: 3, annee: 2026, confiance: "150.00" }, tA)).statusCode).toBe(400);
  });

  it("ecart signé accepté à la création", async () => {
    const tA = await token(UA);
    const created = await mut(server, "previsions.create", { mois: 9, annee: 2026, caPrevisionnel: "1000.00", caRealise: "800.00", ecart: "-200.00", ecartPourcentage: "-20.00" }, tA);
    expect(created.statusCode).toBe(200);
    expect(created.json().result.data.ecart).toBe("-200.00");
  });

  it("update ne touche que les montants/méthode/confiance : mois/annee envoyés sont ignorés (strippés)", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "previsions.create", { mois: 10, annee: 2026, caPrevisionnel: "300.00" }, tA)).json().result.data.id as number;
    const maj = await mut(server, "previsions.update", { id, caRealise: "250.00", mois: 1, annee: 1900 }, tA);
    expect(maj.statusCode).toBe(200);
    const p = maj.json().result.data as { mois: number; annee: number; caPrevisionnel: string; caRealise: string };
    expect(p.caRealise).toBe("250.00");
    expect(p.caPrevisionnel).toBe("300.00"); // préservé
    expect(p.mois).toBe(10); // immuable
    expect(p.annee).toBe(2026); // immuable
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la prévision de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await mut(server, "previsions.create", { mois: 11, annee: 2026 }, tA)).json().result.data.id as number;
    expect((await q(server, "previsions.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "previsions.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "previsions.update", { id, caRealise: "1.00" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "previsions.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "previsions.getById", { id }, tA)).statusCode).toBe(200);
  });

  it("delete OK propriétaire ; id inexistant → 404", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "previsions.create", { mois: 12, annee: 2026 }, tA)).json().result.data.id as number;
    expect((await mut(server, "previsions.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await q(server, "previsions.getById", { id }, tA)).statusCode).toBe(404);
    expect((await mut(server, "previsions.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });
});
