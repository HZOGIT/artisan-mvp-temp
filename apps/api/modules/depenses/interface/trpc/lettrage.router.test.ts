import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL ?? URL?.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@");
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UID = 9960147;
const EMAIL = `lettrage${UID}@t.fr`;
const ARTISAN_ID = 9960147;

const jwt = () =>
  new SignJWT({ userId: UID, email: EMAIL })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

/** L3 e2e : router depenses.rapprocher + getSuggestionsRapprochement */
describe.skipIf(!URL || !APP_URL)("lettrage.router L3", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let factureId: number;
  let transactionId: number;

  const cleanup = async () => {
    await admin.query("delete from ecritures_comptables where \"artisanId\"=$1", [ARTISAN_ID]);
    await admin.query("delete from transactions_bancaires where artisan_id=$1", [ARTISAN_ID]);
    await admin.query("delete from factures where \"artisanId\"=$1", [ARTISAN_ID]);
    await admin.query("delete from clients where \"artisanId\"=$1", [ARTISAN_ID]);
    await admin.query("delete from artisans where id=$1", [ARTISAN_ID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query(
      "insert into artisans (id, \"userId\", \"nomEntreprise\", siret) values ($1,$2,'Test Lettrage','12345678900012')",
      [ARTISAN_ID, UID],
    );
    const { rows: cRows } = await admin.query(
      'insert into clients ("artisanId", nom, email) values ($1,$2,$3) returning id',
      [ARTISAN_ID, "Client Rapprochement", "client@test.fr"],
    );
    const clientId = (cRows[0] as { id: number }).id;
    /** Facture envoyée (état classique pour rapprochement) */
    const { rows: fRows } = await admin.query(
      `insert into factures ("artisanId","clientId","dateFacture",statut,"totalHT","totalTVA","totalTTC","montantPaye","typeDocument")
       values ($1,$2,now(),'envoyee','1000.00','200.00','1200.00','0.00','facture') returning id`,
      [ARTISAN_ID, clientId],
    );
    factureId = (fRows[0] as { id: number }).id;
    /** Transaction créditrice non rapprochée */
    const { rows: tRows } = await admin.query(
      "insert into transactions_bancaires (artisan_id,date_transaction,libelle,montant,type_transaction,ignoree) values ($1,'2026-06-15','VIR CLIENT','1200.00','credit',false) returning id",
      [ARTISAN_ID],
    );
    transactionId = (tRows[0] as { id: number }).id;
    app = buildApp({ jwtSecret: SECRET });
    token = await jwt();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getSuggestionsRapprochement → retourne la transaction crédit + la facture suggérée", async () => {
    const res = await injectTrpc(app, "GET", "depenses.getSuggestionsRapprochement", undefined, token);
    expect(res.statusCode).toBe(200);
    const data = res.json().result.data as Array<{ transaction: { id: number }; suggestions: Array<{ id: number; score: number }> }>;
    const item = data.find((d) => d.transaction.id === transactionId);
    expect(item).toBeDefined();
    /** Montant exact → meilleure suggestion est notre facture */
    const best = item?.suggestions[0];
    expect(best?.id).toBe(factureId);
    expect(best?.score).toBeGreaterThanOrEqual(100);
  });

  it("rapprocher → facture payée, transaction.factureId posé, écritures générées", async () => {
    const res = await injectTrpc(app, "POST", "depenses.rapprocher", { transactionId, factureId }, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toEqual({ success: true });

    /** Facture est maintenant payée */
    const { rows: fRows } = await admin.query("select statut, \"montantPaye\" from factures where id=$1", [factureId]);
    expect((fRows[0] as { statut: string }).statut).toBe("payee");
    expect(Number((fRows[0] as { montantPaye: string }).montantPaye)).toBeCloseTo(1200);

    /** Transaction a son factureId posé */
    const { rows: tRows } = await admin.query("select facture_id from transactions_bancaires where id=$1", [transactionId]);
    expect((tRows[0] as { facture_id: number }).facture_id).toBe(factureId);

    /** Écritures d'encaissement générées (BQ) */
    const { rows: eRows } = await admin.query(
      "select count(*) as n from ecritures_comptables where \"artisanId\"=$1 and journal='BQ' and \"factureId\"=$2",
      [ARTISAN_ID, factureId],
    );
    expect(Number((eRows[0] as { n: string }).n)).toBeGreaterThanOrEqual(2);
  });

  it("rapprocher idempotent : ré-appel avec même factureId → success sans doublons", async () => {
    const before = await admin.query(
      "select count(*) as n from ecritures_comptables where \"artisanId\"=$1 and journal='BQ' and \"factureId\"=$2",
      [ARTISAN_ID, factureId],
    );
    const res = await injectTrpc(app, "POST", "depenses.rapprocher", { transactionId, factureId }, token);
    expect(res.statusCode).toBe(200);
    /** Pas de doublon d'écritures : l'idempotence vient de genererEcrituresEncaissement (purge+réinsert) */
    const after = await admin.query(
      "select count(*) as n from ecritures_comptables where \"artisanId\"=$1 and journal='BQ' and \"factureId\"=$2",
      [ARTISAN_ID, factureId],
    );
    expect(Number((after.rows[0] as { n: string }).n)).toBe(Number((before.rows[0] as { n: string }).n));
  });

  it("rapprocher sur transaction au débit → 400", async () => {
    const { rows } = await admin.query(
      "insert into transactions_bancaires (artisan_id,date_transaction,libelle,montant,type_transaction,ignoree) values ($1,'2026-06-15','ACHAT','50.00','debit',false) returning id",
      [ARTISAN_ID],
    );
    const debitId = (rows[0] as { id: number }).id;
    const res = await injectTrpc(app, "POST", "depenses.rapprocher", { transactionId: debitId, factureId }, token);
    expect(res.statusCode).toBe(400);
  });
});
