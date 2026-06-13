import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { CongeRepositoryDrizzle } from "../../infra/conge-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9909001;
const UB = 9909002;

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

describe.skipIf(!URL)("conges.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let techA = 0;
  let techB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from conges where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from techniciens where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
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
    techA = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Tech A"])).rows[0].id;
    techB = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Tech B"])).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), congeRepo: new CongeRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → conges.list 401", async () => {
    expect((await callQuery(server, "conges.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "conges.create", { technicienId: techA, type: "conge_paye", dateDebut: "2026-07-01", dateFin: "2026-07-05", motif: "Vacances" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(created.json().result.data.statut).toBe("en_attente");
    expect(created.json().result.data.validePar).toBeNull();
    const list = await callQuery(server, "conges.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((c) => c.id === id)).toBe(true);
  });

  it("validation : dateFin < dateDebut → 400 ; date mal formée → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "conges.create", { technicienId: techA, type: "rtt", dateDebut: "2026-07-10", dateFin: "2026-07-05" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "conges.create", { technicienId: techA, type: "rtt", dateDebut: "10/07/2026", dateFin: "2026-07-12" }, tA)).statusCode).toBe(400);
  });

  it("ANTI-IDOR-FK : create avec un technicienId d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "conges.create", { technicienId: techB, type: "rtt", dateDebut: "2026-07-01", dateFin: "2026-07-02" }, tA)).statusCode).toBe(404);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la demande de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "conges.create", { technicienId: techA, type: "maladie", dateDebut: "2026-08-01", dateFin: "2026-08-02" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "conges.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "conges.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "conges.update", { id, motif: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "conges.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "conges.getById", { id }, tA)).json().result.data.type).toBe("maladie");
  });

  it("update partiel + delete OK propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "conges.create", { technicienId: techA, type: "formation", dateDebut: "2026-09-01", dateFin: "2026-09-03", motif: "Avant" }, tA)).json().result.data.id as number;
    const maj = await callMutation(server, "conges.update", { id, motif: "Après" }, tA);
    expect(maj.json().result.data.motif).toBe("Après");
    expect(maj.json().result.data.statut).toBe("en_attente"); // workflow non touché
    expect((await callMutation(server, "conges.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "conges.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("id inexistant du même tenant : getById / update / delete → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "conges.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "conges.update", { id: 999999999, motif: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "conges.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : type invalide, motif > 2000, technicienId non int → 400", async () => {
    const tA = await token(UA);
    const base = { technicienId: techA, dateDebut: "2026-07-01", dateFin: "2026-07-02" };
    expect((await callMutation(server, "conges.create", { ...base, type: "vacances" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "conges.create", { ...base, type: "rtt", motif: "x".repeat(2001) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "conges.create", { technicienId: 1.5, type: "rtt", dateDebut: "2026-07-01", dateFin: "2026-07-02" }, tA)).statusCode).toBe(400);
  });

  it("update : dateFin < dateDebut (fournies ensemble) → 400", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "conges.create", { technicienId: techA, type: "rtt", dateDebut: "2026-10-01", dateFin: "2026-10-02" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "conges.update", { id, dateDebut: "2026-10-10", dateFin: "2026-10-05" }, tA)).statusCode).toBe(400);
  });

  it("update ne peut PAS passer statut/validePar (zod strip) — la demande reste en_attente", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "conges.create", { technicienId: techA, type: "rtt", dateDebut: "2026-11-01", dateFin: "2026-11-02" }, tA)).json().result.data.id as number;
    // tente d'auto-approuver via update : les clés hors schéma sont retirées par zod
    await callMutation(server, "conges.update", { id, statut: "approuve", validePar: 999, motif: "Tentative" }, tA);
    const after = (await callQuery(server, "conges.getById", { id }, tA)).json().result.data as { statut: string; validePar: number | null; motif: string };
    expect(after.statut).toBe("en_attente"); // workflow inviolé
    expect(after.validePar).toBeNull();
    expect(after.motif).toBe("Tentative"); // seul le champ légitime a été appliqué
  });

  it("workflow : approuver (owner) → approuve ; ré-approuver = idempotent ; refuser après approuve → 409", async () => {
    const tA = await token(UA); // l'owner (user UA) n'est lié à aucune fiche technicien → peut approuver
    const id = (await callMutation(server, "conges.create", { technicienId: techA, type: "conge_paye", dateDebut: "2026-12-01", dateFin: "2026-12-02" }, tA)).json().result.data.id as number;
    const appr = await callMutation(server, "conges.approuver", { id, commentaire: "Validé" }, tA);
    expect(appr.statusCode).toBe(200);
    expect(appr.json().result.data.statut).toBe("approuve");
    // idempotent
    expect((await callMutation(server, "conges.approuver", { id }, tA)).json().result.data.statut).toBe("approuve");
    // transition invalide
    expect((await callMutation(server, "conges.refuser", { id }, tA)).statusCode).toBe(409);
  });

  it("ANTI SELF-APPROBATION e2e : l'utilisateur lié à la fiche demandeuse ne peut pas approuver → 403", async () => {
    const tA = await token(UA);
    // on lie la fiche techA à l'utilisateur courant (UA) → UA devient le « demandeur » de techA
    await admin.query('update techniciens set "userId"=$1 where id=$2', [UA, techA]);
    const id = (await callMutation(server, "conges.create", { technicienId: techA, type: "rtt", dateDebut: "2026-12-10", dateFin: "2026-12-11" }, tA)).json().result.data.id as number;
    // UA (lié à techA = le demandeur) tente d'approuver SA propre demande → 403
    expect((await callMutation(server, "conges.approuver", { id }, tA)).statusCode).toBe(403);
    // la demande est restée en_attente (non auto-approuvée)
    expect((await callQuery(server, "conges.getById", { id }, tA)).json().result.data.statut).toBe("en_attente");
    // nettoyage : délier la fiche
    await admin.query('update techniciens set "userId"=null where id=$1', [techA]);
  });
});
