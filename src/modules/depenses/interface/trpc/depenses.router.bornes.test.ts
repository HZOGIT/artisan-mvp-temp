import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DepenseRepositoryDrizzle } from "../../infra/depense-repository-drizzle";

// Durcissement e2e du domaine depenses : bornes zod exhaustives + invariants du transport
// (FK rebranchée hors tenant, enums/dates invalides, longueurs max, statut/userId inviolables
// via update). Complète depenses.router.test.ts (parcours nominal + isolation).

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9890301;
const UB = 9890302;
let seq = 0;
const num = () => `DEP-${Date.now() % 100000}-${++seq}`;

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

describe.skipIf(!URL)("depenses.router e2e — bornes & invariants transport", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let chantierB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from depenses where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
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
    chantierB = (
      await admin.query('insert into chantiers ("artisanId","clientId",reference,nom) values ($1,$2,$3,$4) returning id', [
        artisanB,
        clientB,
        "CH-B-BORNES",
        "Chantier B",
      ])
    ).rows[0].id;
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), depenseRepo: new DepenseRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  const baseCreate = (over: Record<string, unknown> = {}) => ({
    numero: num(),
    dateDepense: "2026-06-15",
    categorie: "achat",
    montantHt: "100.00",
    ...over,
  });

  async function createDepense(tok: string, over: Record<string, unknown> = {}): Promise<number> {
    const res = await callMutation(server, "depenses.create", baseCreate(over), tok);
    return res.json().result.data.id as number;
  }

  it("create — enums invalides (modePaiement / frequenceRecurrence) → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "depenses.create", baseCreate({ modePaiement: "bitcoin" }), tA)).statusCode).toBe(400);
    expect((await callMutation(server, "depenses.create", baseCreate({ recurrente: true, frequenceRecurrence: "hebdo" }), tA)).statusCode).toBe(400);
  });

  it("create — longueurs max dépassées (numero>20 / categorie>50 / fournisseur>255) → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "depenses.create", baseCreate({ numero: "X".repeat(21) }), tA)).statusCode).toBe(400);
    expect((await callMutation(server, "depenses.create", baseCreate({ categorie: "c".repeat(51) }), tA)).statusCode).toBe(400);
    expect((await callMutation(server, "depenses.create", baseCreate({ fournisseur: "f".repeat(256) }), tA)).statusCode).toBe(400);
  });

  it("create — montantHt négatif (string '-10') rejeté par la regex décimale → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "depenses.create", baseCreate({ montantHt: "-10" }), tA)).statusCode).toBe(400);
  });

  it("create — prochaineOccurrence date invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "depenses.create", baseCreate({ prochaineOccurrence: "15/06/2026" }), tA)).statusCode).toBe(400);
  });

  it("create — tauxTva '0' accepté → TVA 0.00 et TTC = HT", async () => {
    const tA = await token(UA);
    const res = await callMutation(server, "depenses.create", baseCreate({ montantHt: "80.00", tauxTva: "0" }), tA);
    expect(res.statusCode).toBe(200);
    const data = res.json().result.data as { montantTva: string; montantTtc: string };
    expect(data.montantTva).toBe("0.00");
    expect(data.montantTtc).toBe("80.00");
  });

  it("update — (re)branche une FK hors tenant (chantierId de B) → 404", async () => {
    const tA = await token(UA);
    const id = await createDepense(tA);
    expect((await callMutation(server, "depenses.update", { id, chantierId: chantierB }, tA)).statusCode).toBe(404);
    // clientId de B aussi rejeté
    expect((await callMutation(server, "depenses.update", { id, clientId: clientB }, tA)).statusCode).toBe(404);
  });

  it("update — FK du tenant acceptée (clientId de A) → 200", async () => {
    const tA = await token(UA);
    const id = await createDepense(tA);
    const res = await callMutation(server, "depenses.update", { id, clientId: clientA }, tA);
    expect(res.statusCode).toBe(200);
    expect((res.json().result.data as { clientId: number }).clientId).toBe(clientA);
  });

  it("update — statut/rembourse/userId NON modifiables via update (clés strippées par zod)", async () => {
    const tA = await token(UA);
    const id = await createDepense(tA);
    // Tente d'injecter des champs réservés au workflow + l'identité du créateur.
    const res = await callMutation(
      server,
      "depenses.update",
      { id, statut: "remboursee", rembourse: true, userId: 999999, description: "maj légitime" },
      tA,
    );
    expect(res.statusCode).toBe(200);
    const data = res.json().result.data as { statut: string; rembourse: boolean; userId: number; description: string };
    expect(data.statut).toBe("brouillon"); // inchangé
    expect(data.rembourse).toBe(false); // inchangé
    expect(data.userId).toBe(UA); // créateur inchangé
    expect(data.description).toBe("maj légitime"); // seul le champ légitime appliqué
  });

  it("update — montantTva/montantTtc fournis par le client sont ignorés (TVA dérivée serveur)", async () => {
    const tA = await token(UA);
    const id = await createDepense(tA, { montantHt: "100.00", tauxTva: "20" });
    // Le client tente de falsifier le TTC ; les clés sont hors schéma → strippées, TVA recalculée.
    const res = await callMutation(server, "depenses.update", { id, montantHt: "100.00", montantTva: "0.00", montantTtc: "1.00" }, tA);
    expect(res.statusCode).toBe(200);
    const data = res.json().result.data as { montantTva: string; montantTtc: string };
    expect(data.montantTva).toBe("20.00");
    expect(data.montantTtc).toBe("120.00");
  });
});
