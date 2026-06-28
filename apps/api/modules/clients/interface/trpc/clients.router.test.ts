import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ClientRepositoryDrizzle } from "../../infra/client-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9929001;
const UB = 9929002;
// Collaborateur sous-privilégié : a `clients.voir` mais PAS `clients.gerer` (prouve le gate de permission).
const UC = 9929003;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function callQuery(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

describe.skipIf(!URL)("clients.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query('delete from permissions_utilisateur where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      // Le propriétaire reçoit ses permissions au provisioning ; les routes clients sont gatées
      // (`clients.voir`/`clients.gerer`) → on les accorde aux utilisateurs de test (sinon 403).
      for (const p of ["clients.voir", "clients.gerer"]) {
        await admin.query('insert into permissions_utilisateur ("userId", permission, autorise) values ($1,$2,true)', [uid, p]);
      }
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    // Collaborateur UC : `clients.voir` SEULEMENT (pas de `clients.gerer`) → prouve le gate d'écriture.
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UC]);
    await admin.query('delete from artisans where "userId"=$1', [UC]);
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [UC]);
    await admin.query("delete from users where id=$1", [UC]);
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)', [UC, `u${UC}@t.fr`, artisanA]);
    await admin.query('insert into permissions_utilisateur ("userId", permission, autorise) values ($1,$2,true)', [UC, "clients.voir"]);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), clientRepo: new ClientRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from factures where "artisanId"=$1', [aId]);
      await admin.query('delete from devis where "artisanId"=$1', [aId]);
      await admin.query('delete from clients where "artisanId"=$1', [aId]);
    }
    for (const uid of [UA, UB, UC]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query('delete from permissions_utilisateur where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("permission gate : un collaborateur avec `clients.voir` mais SANS `clients.gerer` → list 200, create 403", async () => {
    const tC = await token(UC);
    // Lecture autorisée (a la permission `clients.voir`).
    expect((await callQuery(server, "clients.list", undefined, tC)).statusCode).toBe(200);
    // Écriture refusée (pas `clients.gerer`) → FORBIDDEN, pas un accès « authentifié = autorisé ».
    const res = await callMutation(server, "clients.create", { nom: "X" }, tC);
    expect(res.statusCode).toBe(403);
  });

  it("sans cookie → clients.list 401", async () => {
    expect((await callQuery(server, "clients.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "clients.create", { nom: "Durand", email: "marie@a.fr", type: "professionnel" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect(created.json().result.data.type).toBe("professionnel");
    const list = await callQuery(server, "clients.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((c) => c.id === id)).toBe(true);
  });

  it("validation : nom vide → 400 ; e-mail invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "clients.create", { nom: "" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "clients.create", { nom: "X", email: "pas-un-email" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le client de A (PII)", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "clients.create", { nom: "Secret", email: "secret@a.fr" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "clients.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "clients.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "clients.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "clients.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "clients.getById", { id }, tA)).json().result.data.email).toBe("secret@a.fr");
  });

  it("update partiel + delete OK propriétaire (sans document lié)", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "clients.create", { nom: "Avant", ville: "Lyon" }, tA)).json().result.data.id as number;
    const maj = await callMutation(server, "clients.update", { id, nom: "Après" }, tA);
    expect(maj.json().result.data.nom).toBe("Après");
    expect(maj.json().result.data.ville).toBe("Lyon"); // champ non fourni préservé
    expect((await callMutation(server, "clients.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "clients.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("delete REFUSÉ (409) si le client est référencé par une facture", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "clients.create", { nom: "Référencé" }, tA)).json().result.data.id as number;
    await admin.query(`insert into factures ("artisanId","clientId",numero) values ($1,$2,'F-CLI-1')`, [artisanA, id]);
    expect((await callMutation(server, "clients.delete", { id }, tA)).statusCode).toBe(409);
    // le client est toujours là (intégrité préservée)
    expect((await callQuery(server, "clients.getById", { id }, tA)).statusCode).toBe(200);
  });

  it("id inexistant du même tenant : getById / update / delete → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "clients.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "clients.update", { id: 999999999, nom: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "clients.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : nom > 100, email > 320, siret invalide, type invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "clients.create", { nom: "x".repeat(101) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "clients.create", { nom: "OK", email: `${"a".repeat(320)}@b.fr` }, tA)).statusCode).toBe(400);
    // siret > 14 chiffres
    expect((await callMutation(server, "clients.create", { nom: "OK", siret: "1".repeat(15) }, tA)).statusCode).toBe(400);
    // siret 14 chiffres mais clé de contrôle Luhn incorrecte
    expect((await callMutation(server, "clients.create", { nom: "OK", siret: "11111111111111" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "clients.create", { nom: "OK", type: "inconnu" }, tA)).statusCode).toBe(400);
  });

  it("delete 409 via un DEVIS, puis redevient supprimable après retrait des documents liés", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "clients.create", { nom: "AvecDevis" }, tA)).json().result.data.id as number;
    await admin.query(`insert into devis ("artisanId","clientId",numero) values ($1,$2,'D-CLI-1')`, [artisanA, id]);
    expect((await callMutation(server, "clients.delete", { id }, tA)).statusCode).toBe(409);
    // une fois le devis retiré, la suppression redevient possible
    await admin.query('delete from devis where "artisanId"=$1 and "clientId"=$2', [artisanA, id]);
    expect((await callMutation(server, "clients.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "clients.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("update partiel : un champ PII non fourni n'est pas effacé", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "clients.create", { nom: "Plein", email: "plein@a.fr", telephone: "0102030405", ville: "Nice" }, tA)).json().result.data.id as number;
    // on ne met à jour que la ville → email/telephone préservés
    const maj = (await callMutation(server, "clients.update", { id, ville: "Cannes" }, tA)).json().result.data as { email: string; telephone: string; ville: string };
    expect(maj.ville).toBe("Cannes");
    expect(maj.email).toBe("plein@a.fr");
    expect(maj.telephone).toBe("0102030405");
  });

  it("importFromExcel (parité client) : best-effort par ligne → {imported, skipped}, scopé tenant ; 401", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "clients.importFromExcel", { clients: [] })).statusCode).toBe(401);
    const sfx = Date.now();
    const res = await callMutation(
      server,
      "clients.importFromExcel",
      {
        clients: [
          { nom: `Import1-${sfx}`, email: `i1-${sfx}@a.fr`, ville: "Lyon" },
          { nom: `Import2-${sfx}`, telephone: "0606060606" },
          { nom: "" }, // ligne invalide (nom vide) → skipped (creerClient lève ValidationError)
        ],
      },
      tA,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toEqual({ imported: 2, skipped: 1 });
    // les 2 importés apparaissent dans la liste scopée A
    const noms = (await callQuery(server, "clients.list", undefined, tA)).json().result.data as Array<{ nom: string }>;
    expect(noms.map((c) => c.nom)).toEqual(expect.arrayContaining([`Import1-${sfx}`, `Import2-${sfx}`]));
  });
});
