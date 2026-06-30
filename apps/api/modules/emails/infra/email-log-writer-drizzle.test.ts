import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { EmailLogWriterDrizzle } from "./email-log-writer-drizzle";
import { EmailLogReaderDrizzle } from "./email-log-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9937001;
const B = 9937002;
const UA = 9937003;
const UB = 9937004;

describe.skipIf(!URL)("EmailLogWriterDrizzle (PG, update par resendId + isolation RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const adminDb = createDbClient(URL!);
  const appDb = createDbClient(APP_URL!);
  const writer = new EmailLogWriterDrizzle(adminDb.db);
  const reader = new EmailLogReaderDrizzle(appDb.db);

  const cleanup = async () => {
    await admin.query('delete from emails_log where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [A, UA]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, UB]);
    await admin.query(
      'insert into emails_log ("artisanId",destinataire,sujet,statut,"resendId") values ($1,$2,$3,$4,$5)',
      [A, "client-a@t.fr", "Devis 99", "sent", "resend-aaa-001"],
    );
    await admin.query(
      'insert into emails_log ("artisanId",destinataire,sujet,statut,"resendId") values ($1,$2,$3,$4,$5)',
      [B, "client-b@t.fr", "Facture 99", "sent", "resend-bbb-001"],
    );
  });

  afterAll(async () => {
    await cleanup();
    await adminDb.close();
    await appDb.close();
    await admin.end();
  });

  it("bounce connu → renvoie artisanId + destinataire", async () => {
    const result = await writer.updateStatutByResendId("resend-aaa-001", "bounce");
    expect(result).toEqual({ artisanId: A, destinataire: "client-a@t.fr" });
  });

  it("statut bounce visible par le lecteur sous le bon tenant (RLS)", async () => {
    const rows = await reader.list({ artisanId: A, userId: 0 }, { entiteType: undefined });
    const row = rows.find((r) => r.resendId === "resend-aaa-001");
    expect(row?.statut).toBe("bounce");
  });

  it("delivre connu → statut mis à jour", async () => {
    const result = await writer.updateStatutByResendId("resend-bbb-001", "delivre");
    expect(result).toEqual({ artisanId: B, destinataire: "client-b@t.fr" });
  });

  it("resendId inconnu → null (no-op)", async () => {
    expect(await writer.updateStatutByResendId("resend-inconnu-999", "plainte")).toBeNull();
  });

  it("retry même statut → null (déduplication at-least-once)", async () => {
    /** A est déjà en 'bounce' après le 1er test. Un 2e appel avec le même statut = no-op. */
    expect(await writer.updateStatutByResendId("resend-aaa-001", "bounce")).toBeNull();
  });

  it("isolation RLS : tenant A ne voit pas le log de B (même après update)", async () => {
    const rowsA = await reader.list({ artisanId: A, userId: 0 }, {});
    expect(rowsA.every((r) => r.artisanId === A)).toBe(true);
    expect(rowsA.some((r) => r.artisanId === B)).toBe(false);
  });

  it("create() — insère une ligne emails_log lisible sous le bon tenant", async () => {
    await writer.create({ artisanId: A, destinataire: "new@t.fr", sujet: "Facture TEST", type: "envoi_facture", entiteType: "facture", entiteId: 9001 });
    const rows = await reader.list({ artisanId: A, userId: 0 }, { entiteType: "facture" });
    const row = rows.find((r) => r.destinataire === "new@t.fr" && r.type === "envoi_facture");
    expect(row).toBeDefined();
    expect(row?.artisanId).toBe(A);
    expect(row?.statut).toBe("sent");
  });

  it("create() — enregistre le resendId quand fourni (régression OPE-990)", async () => {
    const rid = "resend-test-ope990";
    await writer.create({ artisanId: A, destinataire: "resend@t.fr", sujet: "Facture Resend", type: "envoi_facture", resendId: rid, entiteType: "facture", entiteId: 9002 });
    const rows = await reader.list({ artisanId: A, userId: 0 }, { entiteType: "facture" });
    const row = rows.find((r) => r.destinataire === "resend@t.fr");
    expect(row?.resendId).toBe(rid);
  });

  it("create() — resendId null quand non fourni", async () => {
    await writer.create({ artisanId: A, destinataire: "noresend@t.fr", sujet: "Facture sans resend", type: "envoi_facture" });
    const rows = await reader.list({ artisanId: A, userId: 0 }, {});
    const row = rows.find((r) => r.destinataire === "noresend@t.fr");
    expect(row?.resendId).toBeNull();
  });

  it("create() — isolation RLS : ligne créée pour A invisible depuis B", async () => {
    const rowsB = await reader.list({ artisanId: B, userId: 0 }, {});
    expect(rowsB.some((r) => r.destinataire === "new@t.fr")).toBe(false);
  });
});
