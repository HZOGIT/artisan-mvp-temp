import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

/** L3 — garde de permission sur les mutations sensibles du module dépenses (OPE-787 / OPE-788). */

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

/** owner du compte artisan */
const OWNER = 9887701;
/** collaborateur MEMBRE non-owner rattaché au même artisan (OPE-674 : ne pas utiliser l'owner pour les tests 403) */
const MEMBER = 9887702;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("depenses.router authz — permission gates (OPE-787 / OPE-788)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from permissions_utilisateur where "userId" in ($1,$2)', [OWNER, MEMBER]);
    await admin.query('delete from notes_de_frais where artisan_id in (select id from artisans where "userId"=$1)', [OWNER]);
    await admin.query('delete from transactions_bancaires where artisan_id in (select id from artisans where "userId"=$1)', [OWNER]);
    await admin.query('delete from artisans where "userId"=$1', [OWNER]);
    await admin.query("delete from users where id in ($1,$2)", [OWNER, MEMBER]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [OWNER, `u${OWNER}@t.fr`]);
    const { rows } = await admin.query<{ id: number }>('insert into artisans ("userId") values ($1) returning id', [OWNER]);
    const artisanId = rows[0].id;
    await admin.query(
      'insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)',
      [MEMBER, `u${MEMBER}@t.fr`, artisanId],
    );
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(appDb.db) });
  });

  afterAll(async () => {
    await server.close();
    await cleanup();
    await appDb.close();
    await admin.end();
  });

  it("approuverNoteFrais — membre sans notes_frais.approuver → 403", async () => {
    const tok = await jwt(MEMBER);
    expect((await mut(server, "depenses.approuverNoteFrais", { id: 1 }, tok)).statusCode).toBe(403);
  });

  it("approuverNoteFrais — owner bypasse la garde → non-403 (404 note absente)", async () => {
    const tok = await jwt(OWNER);
    const res = await mut(server, "depenses.approuverNoteFrais", { id: 999999 }, tok);
    expect(res.statusCode).not.toBe(403);
  });

  it("approuverNoteFrais — membre AVEC notes_frais.approuver → non-403", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [MEMBER, "notes_frais.approuver"]);
    const tok = await jwt(MEMBER);
    const res = await mut(server, "depenses.approuverNoteFrais", { id: 999999 }, tok);
    expect(res.statusCode).not.toBe(403);
    await admin.query('delete from permissions_utilisateur where "userId"=$1 and permission=$2', [MEMBER, "notes_frais.approuver"]);
  });

  it("rejeterNoteFrais — membre sans notes_frais.approuver → 403", async () => {
    const tok = await jwt(MEMBER);
    expect((await mut(server, "depenses.rejeterNoteFrais", { id: 1, commentaire: "Justificatif manquant" }, tok)).statusCode).toBe(403);
  });

  it("rejeterNoteFrais — owner bypasse la garde → non-403 (404 note absente)", async () => {
    const tok = await jwt(OWNER);
    const res = await mut(server, "depenses.rejeterNoteFrais", { id: 999999, commentaire: "Justificatif manquant" }, tok);
    expect(res.statusCode).not.toBe(403);
  });

  it("payerNoteFrais — membre sans notes_frais.approuver → 403", async () => {
    const tok = await jwt(MEMBER);
    expect((await mut(server, "depenses.payerNoteFrais", { id: 1 }, tok)).statusCode).toBe(403);
  });

  it("payerNoteFrais — owner bypasse la garde → non-403 (404 note absente)", async () => {
    const tok = await jwt(OWNER);
    const res = await mut(server, "depenses.payerNoteFrais", { id: 999999 }, tok);
    expect(res.statusCode).not.toBe(403);
  });

  it("payerNoteFrais — membre AVEC notes_frais.approuver → non-403", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [MEMBER, "notes_frais.approuver"]);
    const tok = await jwt(MEMBER);
    const res = await mut(server, "depenses.payerNoteFrais", { id: 999999 }, tok);
    expect(res.statusCode).not.toBe(403);
    await admin.query('delete from permissions_utilisateur where "userId"=$1 and permission=$2', [MEMBER, "notes_frais.approuver"]);
  });

  it("importReleve — membre sans comptabilite.voir → 403", async () => {
    const tok = await jwt(MEMBER);
    expect(
      (await mut(server, "depenses.importReleve", { nomFichier: "x.csv", contenuCsv: "date,libelle,montant\n2026-01-01,test,10" }, tok)).statusCode,
    ).toBe(403);
  });

  it("importReleve — owner bypasse la garde → non-403", async () => {
    const tok = await jwt(OWNER);
    const res = await mut(server, "depenses.importReleve", { nomFichier: "x.csv", contenuCsv: "date,libelle,montant\n2026-01-01,test,10" }, tok);
    expect(res.statusCode).not.toBe(403);
  });

  it("importReleve — membre AVEC comptabilite.voir → non-403", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [MEMBER, "comptabilite.voir"]);
    const tok = await jwt(MEMBER);
    const res = await mut(server, "depenses.importReleve", { nomFichier: "x.csv", contenuCsv: "date,libelle,montant\n2026-01-01,test,10" }, tok);
    expect(res.statusCode).not.toBe(403);
    await admin.query('delete from permissions_utilisateur where "userId"=$1 and permission=$2', [MEMBER, "comptabilite.voir"]);
  });

  it("rapprocher — membre sans comptabilite.voir → 403", async () => {
    const tok = await jwt(MEMBER);
    expect((await mut(server, "depenses.rapprocher", { transactionId: 1, factureId: 1 }, tok)).statusCode).toBe(403);
  });

  it("rapprocher — owner bypasse la garde → non-403 (404 transaction absente)", async () => {
    const tok = await jwt(OWNER);
    const res = await mut(server, "depenses.rapprocher", { transactionId: 999999, factureId: 999999 }, tok);
    expect(res.statusCode).not.toBe(403);
  });

  it("exportFecAchats — membre sans comptabilite.voir → 403", async () => {
    const tok = await jwt(MEMBER);
    expect(
      (await mut(server, "depenses.exportFecAchats", { dateDebut: "2026-01-01", dateFin: "2026-12-31" }, tok)).statusCode,
    ).toBe(403);
  });

  it("exportFecAchats — owner bypasse la garde → non-403", async () => {
    const tok = await jwt(OWNER);
    const res = await mut(server, "depenses.exportFecAchats", { dateDebut: "2026-01-01", dateFin: "2026-12-31" }, tok);
    expect(res.statusCode).not.toBe(403);
  });
});
