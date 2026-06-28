import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { FakeEmailPort } from "../../../shared/ports/fakes";
import { envoyerRappelsRdvClients } from "./rappel-rdv-client-use-cases";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const ARTISAN_A = 9970011;
const ARTISAN_B = 9970012;

/** Demain UTC à 10h00 */
function tomorrow10h(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10, 0, 0, 0));
}

/** Après-demain UTC à 10h00 */
function afterTomorrow10h(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10, 0, 0, 0));
}

describe.skipIf(!URL)("envoyerRappelsRdvClients (L2, PG réel)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);

  let clientAvecEmail = 0;
  let clientSansEmail = 0;

  const cleanup = async () => {
    await admin.query('delete from email_optouts where email like \'%@rappel-test.local%\'');
    await admin.query('delete from interventions where "artisanId" in ($1,$2)', [ARTISAN_A, ARTISAN_B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [ARTISAN_A, ARTISAN_B]);
    await admin.query('delete from parametres_artisan where "artisanId" in ($1,$2)', [ARTISAN_A, ARTISAN_B]);
    await admin.query('delete from artisans where id in ($1,$2)', [ARTISAN_A, ARTISAN_B]);
  };

  beforeAll(async () => {
    await cleanup();
    /* Seed artisan A (rappel actif) + artisan B (rappel désactivé) */
    await admin.query(
      'insert into artisans (id,"userId","nomEntreprise",email) values ($1,$2,$3,$4),($5,$6,$7,$8) on conflict (id) do nothing',
      [ARTISAN_A, 9970001, "Plomberie Test Rappel", "artisan-a@rappel-test.local",
       ARTISAN_B, 9970002, "Électricité Test", "artisan-b@rappel-test.local"],
    );
    clientAvecEmail = (await admin.query(
      'insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id',
      [ARTISAN_A, "Client Rappel", "client@rappel-test.local"],
    )).rows[0].id;
    clientSansEmail = (await admin.query(
      'insert into clients ("artisanId",nom) values ($1,$2) returning id',
      [ARTISAN_A, "Client Sans Email"],
    )).rows[0].id;
    /* Désactiver le rappel pour artisan B */
    await admin.query('insert into parametres_artisan ("artisanId","rappelRdvClientActif") values ($1,$2)', [ARTISAN_B, false]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("envoie un rappel pour l'intervention éligible de demain", async () => {
    await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut",statut,"rappelClientEnvoye") values ($1,$2,$3,$4,$5,$6)',
      [ARTISAN_A, clientAvecEmail, "Pose chaudière", tomorrow10h(), "planifiee", false],
    );
    const email = new FakeEmailPort();
    const result = await envoyerRappelsRdvClients(app.db, email);
    expect(result.rappelsEnvoyes).toBe(1);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("client@rappel-test.local");
    expect(email.sent[0].subject).toContain("Rappel");
    expect(email.sent[0].body).toContain("Client Rappel");
  });

  it("exclut les interventions dont rappelClientEnvoye=true (idempotence)", async () => {
    const email = new FakeEmailPort();
    const result = await envoyerRappelsRdvClients(app.db, email);
    expect(result.rappelsEnvoyes).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("exclut les interventions sans email client", async () => {
    await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut",statut,"rappelClientEnvoye") values ($1,$2,$3,$4,$5,$6)',
      [ARTISAN_A, clientSansEmail, "Dépannage", tomorrow10h(), "planifiee", false],
    );
    const email = new FakeEmailPort();
    const result = await envoyerRappelsRdvClients(app.db, email);
    expect(result.rappelsEnvoyes).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("exclut les clients opt-out", async () => {
    const clientOptout = (await admin.query(
      'insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id',
      [ARTISAN_A, "Client Optout", "optout@rappel-test.local"],
    )).rows[0].id;
    await admin.query('insert into email_optouts (email) values ($1) on conflict do nothing', ["optout@rappel-test.local"]);
    await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut",statut,"rappelClientEnvoye") values ($1,$2,$3,$4,$5,$6)',
      [ARTISAN_A, clientOptout, "Visite optout", tomorrow10h(), "planifiee", false],
    );
    const email = new FakeEmailPort();
    const result = await envoyerRappelsRdvClients(app.db, email);
    expect(result.rappelsEnvoyes).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("exclut les interventions après-demain (hors fenêtre J-1)", async () => {
    const clientA2 = (await admin.query(
      'insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id',
      [ARTISAN_A, "Client J+2", "j2@rappel-test.local"],
    )).rows[0].id;
    await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut",statut,"rappelClientEnvoye") values ($1,$2,$3,$4,$5,$6)',
      [ARTISAN_A, clientA2, "Intervention J+2", afterTomorrow10h(), "planifiee", false],
    );
    const email = new FakeEmailPort();
    const result = await envoyerRappelsRdvClients(app.db, email);
    expect(result.rappelsEnvoyes).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("respecte le toggle rappelRdvClientActif=false (artisan B)", async () => {
    const clientB = (await admin.query(
      'insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id',
      [ARTISAN_B, "Client B", "client-b@rappel-test.local"],
    )).rows[0].id;
    await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut",statut,"rappelClientEnvoye") values ($1,$2,$3,$4,$5,$6)',
      [ARTISAN_B, clientB, "Intervention B", tomorrow10h(), "planifiee", false],
    );
    const email = new FakeEmailPort();
    const result = await envoyerRappelsRdvClients(app.db, email);
    expect(result.rappelsEnvoyes).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("pose le drapeau rappelClientEnvoye=true après envoi", async () => {
    const clientFresh = (await admin.query(
      'insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id',
      [ARTISAN_A, "Client Flag", "flag@rappel-test.local"],
    )).rows[0].id;
    await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut",statut,"rappelClientEnvoye") values ($1,$2,$3,$4,$5,$6)',
      [ARTISAN_A, clientFresh, "Intervention Flag", tomorrow10h(), "planifiee", false],
    );
    const email = new FakeEmailPort();
    await envoyerRappelsRdvClients(app.db, email);
    expect(email.sent).toHaveLength(1);
    const rows = (await admin.query('select "rappelClientEnvoye","dateRappelClient" from interventions where "clientId"=$1', [clientFresh])).rows;
    expect(rows[0].rappelClientEnvoye).toBe(true);
    expect(rows[0].dateRappelClient).toBeTruthy();
  });
});
