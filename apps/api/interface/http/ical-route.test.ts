import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { buildApp } from "../../app";

const URL = process.env.DATABASE_URL;
const UID = 9961091;
const TOKEN = "ical-token-9961091-xxxxxxxxxxxxxxxxxxxxxxxxxxx";

// E2E de la route publique `/api/calendar/:token.ics` via le routeur MONTÉ (buildApp + inject), sans
// cookie. Jeton inconnu → 404 ; bon jeton → 200 text/calendar avec l'intervention.
describe.skipIf(!URL)("GET /api/calendar/:token.ics (route publique iCal)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from interventions where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    const artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise","icalToken") values ($1,$2,$3) returning id', [UID, "Plomberie Test", TOKEN])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [artisanId, "Dupont", "Jean"])).rows[0].id;
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut","dateFin",statut) values ($1,$2,$3, now() + interval \'2 days\', now() + interval \'2 days 2 hours\', $4)', [artisanId, clientId, "Dépannage fuite", "planifiee"]);
    app = buildApp();
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("jeton inconnu → 404 text/plain", async () => {
    const res = await app.inject({ method: "GET", url: "/api/calendar/inconnu-zzzzzzzzzzzzzzzzzz.ics" });
    expect(res.statusCode).toBe(404);
  });

  it("bon jeton → 200 text/calendar avec l'intervention", async () => {
    const res = await app.inject({ method: "GET", url: `/api/calendar/${TOKEN}.ics` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/calendar");
    expect(res.body).toContain("BEGIN:VCALENDAR");
    expect(res.body).toContain("X-WR-CALNAME:Operioz — Plomberie Test");
    expect(res.body).toContain("SUMMARY:Dépannage fuite");
    expect(res.body).toContain("Client : Jean Dupont");
  });
});
