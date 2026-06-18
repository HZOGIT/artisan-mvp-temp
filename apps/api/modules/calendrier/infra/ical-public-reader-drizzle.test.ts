import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { IcalPublicReaderDrizzle } from "./ical-public-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9957281;
const UID_B = 9957282;
const TOKEN_A = "ical-9957281-aaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "ical-9957282-bbbbbbbbbbbbbbbbbbbb";

// L2 : flux iCal public. L'artisan est résolu par `icalToken` (table identité HORS RLS), puis ses
// interventions sont lues SOUS LE TENANT (RLS) depuis `since`. Le jeton EST la capacité → aucun accès
// cross-tenant. Vérifie résolution token, filtre `since`, tri, enrichissement client, et token inconnu.
describe.skipIf(!URL)("IcalPublicReaderDrizzle (flux iCal par token, RLS scopée)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new IcalPublicReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from interventions where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise","icalToken") values ($1,$2,$3) returning id', [UID_A, "Agenda A", TOKEN_A])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise","icalToken") values ($1,$2,$3) returning id', [UID_B, "Agenda B", TOKEN_B])).rows[0].id;
    const clientA = (await admin.query('insert into clients ("artisanId",nom,prenom,telephone) values ($1,$2,$3,$4) returning id', [artisanA, "Roux", "Sophie", "0102030405"])).rows[0].id;
    const clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "AutreClient"])).rows[0].id;
    // A : une intervention AVANT `since` (exclue), deux après (incluses, à trier)
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut",adresse,statut) values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "Ancienne", "2026-05-01T08:00:00Z", "1 rue X", "terminee"]);
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,$4)', [artisanA, clientA, "Tardive", "2026-06-20T08:00:00Z"]);
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,$4)', [artisanA, clientA, "Proche", "2026-06-10T08:00:00Z"]);
    // B : une intervention après `since` — NE DOIT PAS apparaître dans le feed de A
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,$4)', [artisanB, clientB, "ChezB", "2026-06-15T08:00:00Z"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getFeedByToken : résout l'artisan, filtre `since`, trie asc, enrichit le client", async () => {
    const feed = await reader.getFeedByToken(TOKEN_A, new Date("2026-06-01T00:00:00Z"));
    expect(feed).not.toBeNull();
    expect(feed!.calName).toBe("Agenda A");
    expect(feed!.events.map((e) => e.titre)).toEqual(["Proche", "Tardive"]); // Ancienne exclue, tri asc
    expect(feed!.events[0].clientNom).toBe("Sophie Roux");
    expect(feed!.events[0].clientTelephone).toBe("0102030405");
  });

  it("isolation : le feed de A ne contient pas l'intervention de B", async () => {
    const feed = await reader.getFeedByToken(TOKEN_A, new Date("2026-06-01T00:00:00Z"));
    expect(feed!.events.some((e) => e.titre === "ChezB")).toBe(false);
  });

  it("token inconnu → null", async () => {
    expect(await reader.getFeedByToken("token-inexistant-zzzzzzzzzzzz", new Date("2026-06-01T00:00:00Z"))).toBeNull();
  });
});
