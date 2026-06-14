import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DevisRepositoryDrizzle } from "../../infra/devis-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

// Durcissement e2e du domaine devis : bornes zod exhaustives + invariants du transport
// (numero/statut/totaux inviolables, ligne liée au devis ciblé). Complète devis.router.test.ts.

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9893301;
const UB = 9893302;

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

describe.skipIf(!URL)("devis.router e2e — bornes & invariants transport", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from parametres_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
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
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), devisRepo: new DevisRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  async function createDevis(tok: string, over: Record<string, unknown> = {}): Promise<number> {
    const res = await callMutation(server, "devis.create", { clientId: clientA, ...over }, tok);
    return res.json().result.data.id as number;
  }

  it("create — bornes max (objet>500, referenceClient>100, conditionsPaiement>2000, notes>5000) → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "devis.create", { clientId: clientA, objet: "x".repeat(501) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "devis.create", { clientId: clientA, referenceClient: "x".repeat(101) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "devis.create", { clientId: clientA, conditionsPaiement: "x".repeat(2001) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "devis.create", { clientId: clientA, notes: "x".repeat(5001) }, tA)).statusCode).toBe(400);
  });

  it("create — dateValidite invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "devis.create", { clientId: clientA, dateValidite: "31/12/2026" }, tA)).statusCode).toBe(400);
  });

  it("addLigne — bornes (designation>500, reference>50, unite>20) + prix négatif + type invalide → 400", async () => {
    const tA = await token(UA);
    const id = await createDevis(tA);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "x".repeat(501), prixUnitaireHT: "1" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "OK", prixUnitaireHT: "1", reference: "r".repeat(51) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "OK", prixUnitaireHT: "1", unite: "u".repeat(21) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "OK", prixUnitaireHT: "-5" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "devis.addLigne", { devisId: id, designation: "OK", prixUnitaireHT: "1", type: "materiel" }, tA)).statusCode).toBe(400);
  });

  it("INVARIANT transport : numero/statut/totaux envoyés au create sont IGNORÉS (clés strippées)", async () => {
    const tA = await token(UA);
    const res = await callMutation(
      server,
      "devis.create",
      { clientId: clientA, objet: "Falsif", numero: "HACK-999", statut: "accepte", totalTTC: "9999.99" },
      tA,
    );
    expect(res.statusCode).toBe(200);
    const d = res.json().result.data as { numero: string; statut: string; totalTTC: string };
    expect(d.numero).toMatch(/^DEV-\d{5}$/); // numéro serveur, pas "HACK-999"
    expect(d.statut).toBe("brouillon"); // statut serveur, pas "accepte"
    expect(d.totalTTC).toBe("0.00"); // total dérivé des lignes, pas "9999.99"
  });

  it("INVARIANT transport : numero/statut/totaux envoyés au update sont IGNORÉS", async () => {
    const tA = await token(UA);
    const id = await createDevis(tA, { objet: "Avant" });
    const numAvant = (await callQuery(server, "devis.getById", { id }, tA)).json().result.data.numero as string;
    const res = await callMutation(
      server,
      "devis.update",
      { id, objet: "Après", numero: "HACK-1", statut: "accepte", totalTTC: "5000.00" },
      tA,
    );
    expect(res.statusCode).toBe(200);
    const d = res.json().result.data as { numero: string; statut: string; totalTTC: string; objet: string };
    expect(d.objet).toBe("Après");
    expect(d.numero).toBe(numAvant); // numéro immuable
    expect(d.statut).toBe("brouillon"); // statut non modifiable via update
    expect(d.totalTTC).toBe("0.00"); // pas de total falsifiable
  });

  it("updateLigne/deleteLigne — recalculs ; ligne d'un AUTRE devis du tenant → 404 ; ligne inexistante → 404", async () => {
    const tA = await token(UA);
    const id1 = await createDevis(tA);
    const id2 = await createDevis(tA);
    const l1 = (await callMutation(server, "devis.addLigne", { devisId: id1, designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA)).json().result.data.id as number;
    // updateLigne avec le mauvais devisId (l1 appartient à id1, on prétend id2) → 404
    expect((await callMutation(server, "devis.updateLigne", { id: l1, devisId: id2, quantite: "5" }, tA)).statusCode).toBe(404);
    // recalcul après modif légitime
    await callMutation(server, "devis.updateLigne", { id: l1, devisId: id1, quantite: "3" }, tA);
    expect((await callQuery(server, "devis.getById", { id: id1 }, tA)).json().result.data.totalTTC).toBe("360.00");
    // ligne inexistante → 404
    expect((await callMutation(server, "devis.updateLigne", { id: 999999999, devisId: id1, quantite: "1" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "devis.deleteLigne", { id: 999999999, devisId: id1 }, tA)).statusCode).toBe(404);
    // deleteLigne recalcule
    await callMutation(server, "devis.deleteLigne", { id: l1, devisId: id1 }, tA);
    expect((await callQuery(server, "devis.getById", { id: id1 }, tA)).json().result.data.totalTTC).toBe("0.00");
  });
});
