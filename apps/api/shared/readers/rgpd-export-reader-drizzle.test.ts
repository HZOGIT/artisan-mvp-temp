import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db/client";
import { RgpdExportReaderDrizzle } from "./rgpd-export-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const ARTISAN_ID = 999201;
const USER_ID = 999201;

describe.skipIf(!URL)("RgpdExportReaderDrizzle — champs portabilité Art.20", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new RgpdExportReaderDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from artisans where id = $1', [ARTISAN_ID]);
    await admin.query('delete from users where id = $1', [USER_ID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query(
      `insert into users (id, "openId", email) values ($1, $2, $3) on conflict do nothing`,
      [USER_ID, `test-rgpd-${USER_ID}`, `rgpd-test-${USER_ID}@test.invalid`],
    );
    await admin.query(
      `insert into artisans (id, "userId", "nomEntreprise") values ($1, $2, $3)`,
      [ARTISAN_ID, USER_ID, "Test RGPD Export"],
    );
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("renvoie tous les champs portabilité requis (Art.20) — y compris les 7 tables manquantes", async () => {
    const result = await reader.read(ARTISAN_ID, USER_ID);

    expect(result.version).toBe("1.0");
    expect(result.artisanId).toBe(ARTISAN_ID);

    /* Champs existants */
    expect(Array.isArray(result.clients)).toBe(true);
    expect(Array.isArray(result.devis)).toBe(true);
    expect(Array.isArray(result.factures)).toBe(true);
    expect(Array.isArray(result.interventions)).toBe(true);
    expect(Array.isArray(result.rdvEnLigne)).toBe(true);
    expect(Array.isArray(result.depenses)).toBe(true);
    expect(Array.isArray(result.notesDeFrais)).toBe(true);
    expect(Array.isArray(result.chantiers)).toBe(true);
    expect(Array.isArray(result.techniciens)).toBe(true);
    expect(Array.isArray(result.vehicules)).toBe(true);

    /* Champs manquants avant ce fix — doivent maintenant être présents */
    expect(Array.isArray(result.demandesContact)).toBe(true);
    expect(Array.isArray(result.deplacements)).toBe(true);
    expect(Array.isArray(result.contratsMaintenance)).toBe(true);
    expect(Array.isArray(result.conversations)).toBe(true);
    expect(Array.isArray(result.avisClients)).toBe(true);
    expect(Array.isArray(result.commandesFournisseurs)).toBe(true);
    expect(Array.isArray(result.emailsLog)).toBe(true);
  });
});
