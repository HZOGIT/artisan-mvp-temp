import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { NoteDeFraisRepositoryDrizzle } from "../../infra/note-de-frais-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9899001;
const UB = 9899002;
const UEMP = 9899050; // un « salarié » du tenant A, demandeur d'une note (≠ approbateur owner)
let seq = 0;
const numero = () => `NDF-R-${++seq}`;

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
    // salarié du tenant A (demandeur, sans artisan propre)
    await admin.query("delete from users where id=$1", [UEMP]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','technicien')", [UEMP, `u${UEMP}@t.fr`]);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), noteDeFraisRepo: new NoteDeFraisRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await admin.query("delete from users where id=$1", [UEMP]);
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

  it("id inexistant du même tenant : getById / update / delete → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "notesDeFrais.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "notesDeFrais.update", { id: 999999999, titre: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "notesDeFrais.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : numero > 20, titre > 255, montant non décimal → 400", async () => {
    const tA = await token(UA);
    const base = { periodeDebut: "2026-06-01", periodeFin: "2026-06-30" };
    expect((await callMutation(server, "notesDeFrais.create", { ...base, numero: "x".repeat(21), titre: "OK" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "notesDeFrais.create", { ...base, numero: numero(), titre: "x".repeat(256) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "notesDeFrais.create", { ...base, numero: numero(), titre: "OK", montantTotal: "abc" }, tA)).statusCode).toBe(400);
  });

  it("update : periodeFin < periodeDebut (fournies ensemble) → 400", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "Dates", periodeDebut: "2026-10-01", periodeFin: "2026-10-31" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "notesDeFrais.update", { id, periodeDebut: "2026-10-20", periodeFin: "2026-10-10" }, tA)).statusCode).toBe(400);
  });

  it("update ne peut PAS passer statut/userId (zod strip) — note brouillon, userId inchangé", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "Garde", periodeDebut: "2026-11-01", periodeFin: "2026-11-30" }, tA)).json().result.data.id as number;
    // tente d'auto-approuver + usurper le demandeur via update : clés hors schéma retirées par zod
    await callMutation(server, "notesDeFrais.update", { id, statut: "approuvee", userId: 999, titre: "Toujours" }, tA);
    const after = (await callQuery(server, "notesDeFrais.getById", { id }, tA)).json().result.data as { statut: string; userId: number; titre: string };
    expect(after.statut).toBe("brouillon"); // workflow inviolé
    expect(after.userId).toBe(UA); // demandeur inchangé
    expect(after.titre).toBe("Toujours"); // seul le champ légitime appliqué
  });

  it("ANTI SELF-APPROBATION e2e : l'owner ne peut pas approuver sa propre note (userId = lui) → 403", async () => {
    const tA = await token(UA);
    // create force userId = UA → UA est le demandeur
    const id = (await callMutation(server, "notesDeFrais.create", { numero: numero(), titre: "Self", periodeDebut: "2026-12-01", periodeFin: "2026-12-31" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "notesDeFrais.soumettre", { id }, tA)).json().result.data.statut).toBe("soumise");
    // UA = demandeur tente d'approuver sa propre note → 403
    expect((await callMutation(server, "notesDeFrais.approuver", { id }, tA)).statusCode).toBe(403);
    expect((await callQuery(server, "notesDeFrais.getById", { id }, tA)).json().result.data.statut).toBe("soumise");
  });

  it("workflow e2e : note d'un salarié → soumise → approuvée (owner ≠ demandeur) → payée", async () => {
    const tA = await token(UA);
    // note demandée par le salarié UEMP (≠ owner UA), seedée via admin
    const ins = await admin.query(
      "insert into notes_de_frais (artisan_id, user_id, numero, titre, periode_debut, periode_fin) values ($1,$2,$3,'Frais salarié','2027-01-01','2027-01-31') returning id",
      [artisanA, UEMP, `NDF-EMP-${++seq}`],
    );
    const id = ins.rows[0].id as number;
    expect((await callMutation(server, "notesDeFrais.soumettre", { id }, tA)).json().result.data.statut).toBe("soumise");
    // owner UA approuve (UA ≠ UEMP demandeur) → OK
    const appr = await callMutation(server, "notesDeFrais.approuver", { id, commentaire: "Validé" }, tA);
    expect(appr.statusCode).toBe(200);
    expect(appr.json().result.data.statut).toBe("approuvee");
    expect(appr.json().result.data.dateApprobation).not.toBeNull();
    // payer
    expect((await callMutation(server, "notesDeFrais.payer", { id }, tA)).json().result.data.statut).toBe("payee");
    // transition invalide : re-soumettre une note payée → 409
    expect((await callMutation(server, "notesDeFrais.soumettre", { id }, tA)).statusCode).toBe(409);
  });
});
