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

/**
 * L3 e2e : router depenses.rapprocher + getSuggestionsRapprochement.
 *
 * La facture est créée via le flux tRPC complet (create→addLigne→envoyer) afin que les
 * écritures de vente (VE) soient générées ET validées — exactement comme en production.
 * Conséquence : rapprocher→payer→marquerFacturePayee appelle genererEcrituresVente sur des
 * écritures déjà validées → 409 tant qu'OPE-666 n'est pas mergée. Ces tests sont donc
 * intentionnellement ROUGES avant OPE-666 et VERTS après.
 */
describe.skipIf(!URL || !APP_URL)("lettrage.router L3", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let factureId: number;
  let transactionId: number;

  const cleanup = async () => {
    await admin.query("delete from ecritures_comptables where \"artisanId\"=$1", [ARTISAN_ID]);
    await admin.query("delete from factures_lignes where \"factureId\" in (select id from factures where \"artisanId\"=$1)", [ARTISAN_ID]);
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

    app = buildApp({ jwtSecret: SECRET });
    token = await jwt();

    /**
     * Création de la facture via flux tRPC complet (create → addLigne → envoyer).
     * Ceci génère ET valide les écritures de vente (VE) — identique au chemin de production.
     * Ne pas substituer par un INSERT SQL brut : aucune écriture ne serait créée, le test
     * deviendrait false-green (pas de 409 au rapprochement).
     */
    const created = await injectTrpc(app, "POST", "factures.create", { clientId, objet: "Travaux test lettrage" }, token);
    expect(created.statusCode).toBe(200);
    factureId = (created.json().result.data as { id: number }).id;

    await injectTrpc(app, "POST", "factures.addLigne", {
      factureId,
      designation: "Main d'œuvre",
      quantite: "1",
      prixUnitaireHT: "1000.00",
      tauxTVA: "20",
    }, token);

    const envoyee = await injectTrpc(app, "POST", "factures.envoyer", { id: factureId }, token);
    expect(envoyee.statusCode).toBe(200);

    const { rows: tRows } = await admin.query(
      "insert into transactions_bancaires (artisan_id,date_transaction,libelle,montant,type_transaction,ignoree) values ($1,'2026-06-15','VIR CLIENT','1200.00','credit',false) returning id",
      [ARTISAN_ID],
    );
    transactionId = (tRows[0] as { id: number }).id;
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
    const best = item?.suggestions[0];
    expect(best?.id).toBe(factureId);
    expect(best?.score).toBeGreaterThanOrEqual(100);
  });

  /**
   * Intentionnellement ROUGE avant OPE-666 (fix genererEcrituresVente sur écritures validées).
   * VERT après : facture payée, transaction.factureId posé, pièce BQ générée.
   */
  it("rapprocher → facture payée, transaction.factureId posé, écritures BQ générées", async () => {
    const res = await injectTrpc(app, "POST", "depenses.rapprocher", { transactionId, factureId }, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toEqual({ success: true });

    const { rows: fRows } = await admin.query("select statut, \"montantPaye\" from factures where id=$1", [factureId]);
    expect((fRows[0] as { statut: string }).statut).toBe("payee");
    expect(Number((fRows[0] as { montantPaye: string }).montantPaye)).toBeCloseTo(1200);

    const { rows: tRows } = await admin.query("select facture_id from transactions_bancaires where id=$1", [transactionId]);
    expect((tRows[0] as { facture_id: number }).facture_id).toBe(factureId);

    const { rows: eRows } = await admin.query(
      "select count(*) as n from ecritures_comptables where \"artisanId\"=$1 and journal='BQ' and \"factureId\"=$2",
      [ARTISAN_ID, factureId],
    );
    expect(Number((eRows[0] as { n: string }).n)).toBeGreaterThanOrEqual(2);
  });

  it("rapprocher idempotent : ré-appel avec même factureId → success sans doublons BQ", async () => {
    const before = await admin.query(
      "select count(*) as n from ecritures_comptables where \"artisanId\"=$1 and journal='BQ' and \"factureId\"=$2",
      [ARTISAN_ID, factureId],
    );
    const res = await injectTrpc(app, "POST", "depenses.rapprocher", { transactionId, factureId }, token);
    expect(res.statusCode).toBe(200);
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
