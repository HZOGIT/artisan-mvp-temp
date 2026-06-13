import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ChantierRepositoryDrizzle } from "../../infra/chantier-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9889001;
const UB = 9889002;
let seq = 0;
const ref = () => `CH-R-${++seq}`;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return app.inject({
    method: "POST",
    url: `/api/trpc/${path}`,
    headers: { "content-type": "application/json", ...(tok ? { cookie: `token=${tok}` } : {}) },
    payload: JSON.stringify(input),
  });
}
function callQuery(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return app.inject({ method: "GET", url: `/api/trpc/${path}${qs}`, headers: tok ? { cookie: `token=${tok}` } : {} });
}

describe.skipIf(!URL)("chantiers.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from chantiers where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), chantierRepo: new ChantierRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → chantiers.list 401", async () => {
    expect((await callQuery(server, "chantiers.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Rénovation", budgetPrevisionnel: "20000.00" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(created.json().result.data.statut).toBe("planifie");
    const list = await callQuery(server, "chantiers.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((c) => c.id === id)).toBe(true);
  });

  it("validation : reference vide → 400 ; avancement 150 → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "chantiers.create", { clientId: clientA, reference: "", nom: "X" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "X", avancement: 150 }, tA)).statusCode).toBe(400);
  });

  it("ANTI-IDOR-FK : create avec un clientId d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "chantiers.create", { clientId: clientB, reference: ref(), nom: "Vol" }, tA)).statusCode).toBe(404);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le chantier de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Secret" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "chantiers.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "chantiers.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "chantiers.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "chantiers.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "chantiers.getById", { id }, tA)).json().result.data.nom).toBe("Secret");
  });

  it("update partiel (avancement/statut) + delete OK propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Avant", ville: "Lyon" }, tA)).json().result.data.id as number;
    const maj = await callMutation(server, "chantiers.update", { id, nom: "Après", statut: "en_cours", avancement: 50 }, tA);
    expect(maj.json().result.data.nom).toBe("Après");
    expect(maj.json().result.data.statut).toBe("en_cours");
    expect(maj.json().result.data.avancement).toBe(50);
    expect(maj.json().result.data.ville).toBe("Lyon"); // préservé
    expect((await callMutation(server, "chantiers.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "chantiers.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("id inexistant du même tenant : getById / update / delete → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "chantiers.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "chantiers.update", { id: 999999999, nom: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "chantiers.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : reference > 50, nom > 255, statut/priorite invalides, budget non décimal → 400", async () => {
    const tA = await token(UA);
    const b = { clientId: clientA };
    expect((await callMutation(server, "chantiers.create", { ...b, reference: "x".repeat(51), nom: "OK" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "chantiers.create", { ...b, reference: ref(), nom: "x".repeat(256) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "chantiers.create", { ...b, reference: ref(), nom: "OK", statut: "inconnu" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "chantiers.create", { ...b, reference: ref(), nom: "OK", priorite: "extreme" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "chantiers.create", { ...b, reference: ref(), nom: "OK", budgetPrevisionnel: "abc" }, tA)).statusCode).toBe(400);
  });

  it("avancement borné : 0 et 100 acceptés ; -1 et 101 → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Min", avancement: 0 }, tA)).statusCode).toBe(200);
    expect((await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Max", avancement: 100 }, tA)).statusCode).toBe(200);
    expect((await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Neg", avancement: -1 }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Over", avancement: 101 }, tA)).statusCode).toBe(400);
  });

  it("update : dateFinPrevue < dateDebut (fournies ensemble) → 400", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Dates" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "chantiers.update", { id, dateDebut: "2026-09-10", dateFinPrevue: "2026-09-01" }, tA)).statusCode).toBe(400);
  });

  it("update ne peut PAS rattacher un autre client (clientId strip par zod) — client immuable", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "chantiers.create", { clientId: clientA, reference: ref(), nom: "Immuable" }, tA)).json().result.data.id as number;
    // tente de réaffecter le chantier au client de B via update → clé hors schéma retirée
    await callMutation(server, "chantiers.update", { id, clientId: clientB, nom: "Toujours A" }, tA);
    const after = (await callQuery(server, "chantiers.getById", { id }, tA)).json().result.data as { clientId: number; nom: string };
    expect(after.clientId).toBe(clientA); // client inchangé
    expect(after.nom).toBe("Toujours A"); // seul le champ légitime appliqué
  });
});
