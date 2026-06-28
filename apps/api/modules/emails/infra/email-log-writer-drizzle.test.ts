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

  it("isolation RLS : tenant A ne voit pas le log de B (même après update)", async () => {
    const rowsA = await reader.list({ artisanId: A, userId: 0 }, {});
    expect(rowsA.every((r) => r.artisanId === A)).toBe(true);
    expect(rowsA.some((r) => r.artisanId === B)).toBe(false);
  });
});
