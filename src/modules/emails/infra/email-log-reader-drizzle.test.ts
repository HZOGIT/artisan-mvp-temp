import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { EmailLogReaderDrizzle } from "./email-log-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9936001;
const B = 9936002;
const UA = 9936003;
const UB = 9936004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("EmailLogReaderDrizzle (PG, RLS + scope tenant + filtres)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new EmailLogReaderDrizzle(app.db);

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
    const ins = (artisanId: number, dest: string, sujet: string, statut: string, entiteType: string | null, entiteId: number | null, createdAt: string) =>
      admin.query(
        'insert into emails_log ("artisanId",destinataire,sujet,statut,"entiteType","entiteId","createdAt") values ($1,$2,$3,$4,$5,$6,$7)',
        [artisanId, dest, sujet, statut, entiteType, entiteId, createdAt],
      );
    await ins(A, "a1@t.fr", "Devis 10", "sent", "devis", 10, "2026-01-01T10:00:00Z");
    await ins(A, "a2@t.fr", "Facture 20", "sent", "facture", 20, "2026-01-03T10:00:00Z");
    await ins(A, "a3@t.fr", "Devis 11", "failed", "devis", 11, "2026-01-02T10:00:00Z");
    await ins(B, "b1@t.fr", "Autre tenant", "sent", "devis", 10, "2026-01-05T10:00:00Z");
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("list : plus récents d'abord, scopé tenant A (RLS), B exclu", async () => {
    const rows = await reader.list(ctx(A), {});
    expect(rows.map((r) => r.sujet)).toEqual(["Facture 20", "Devis 11", "Devis 10"]);
    expect(rows.every((r) => r.artisanId === A)).toBe(true);
  });

  it("list : filtre entiteType + entiteId", async () => {
    expect((await reader.list(ctx(A), { entiteType: "devis" })).map((r) => r.sujet)).toEqual(["Devis 11", "Devis 10"]);
    expect((await reader.list(ctx(A), { entiteType: "facture", entiteId: 20 })).map((r) => r.sujet)).toEqual(["Facture 20"]);
  });

  it("list : limite bornée ; isolation B ne voit que ses lignes", async () => {
    expect(await reader.list(ctx(A), { limit: 2 })).toHaveLength(2);
    const rowsB = await reader.list(ctx(B), {});
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].sujet).toBe("Autre tenant");
  });
});
