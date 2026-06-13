import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { NoteDeFraisRepositoryDrizzle } from "../../infra/note-de-frais-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9899001;
const UB = 9899002;
let seq = 0;
const numero = () => `NDF-R-${++seq}`;

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

describe.skipIf(!URL)("notesDeFrais.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from notes_de_frais where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
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
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), noteDeFraisRepo: new NoteDeFraisRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → notesDeFrais.list 401", async () => {
    expect((await callQuery(server, "notesDeFrais.list", undefined)).statusCode).toBe(401);
  });

  it("create force userId = utilisateur courant + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "Frais juin", periodeDebut: "2026-06-01", periodeFin: "2026-06-30", montantTotal: "150.00" }, tA);
    expect(created.statusCode).toBe(200);
    const data = created.json().result.data as { id: number; userId: number; statut: string };
    expect(data.statut).toBe("brouillon");
    expect(data.userId).toBe(UA); // forcé à l'utilisateur courant
    const list = await callQuery(server, "notesDeFrais.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((n) => n.id === data.id)).toBe(true);
  });

  it("validation : periodeFin < periodeDebut → 400 ; montant négatif → 400 ; date mal formée → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "X", periodeDebut: "2026-07-10", periodeFin: "2026-07-05" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "X", periodeDebut: "2026-07-01", periodeFin: "2026-07-31", montantTotal: "-5.00" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "X", periodeDebut: "01/07/2026", periodeFin: "2026-07-31" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la note de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "Secret", periodeDebut: "2026-08-01", periodeFin: "2026-08-31" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "notesDeFrais.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "notesDeFrais.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "notesDeFrais.update", { id, titre: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "notesDeFrais.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "notesDeFrais.getById", { id }, tA)).json().result.data.titre).toBe("Secret");
  });

  it("update partiel (statut intact) + delete OK propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "Avant", periodeDebut: "2026-09-01", periodeFin: "2026-09-30", montantTotal: "100.00" }, tA)).json().result.data.id as number;
    const maj = await callMutation(server, "notesDeFrais.update", { id, titre: "Après" }, tA);
    expect(maj.json().result.data.titre).toBe("Après");
    expect(maj.json().result.data.statut).toBe("brouillon"); // workflow non touché
    expect(maj.json().result.data.montantTotal).toBe("100.00"); // préservé
    expect((await callMutation(server, "notesDeFrais.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "notesDeFrais.getById", { id }, tA)).statusCode).toBe(404);
  });
});
