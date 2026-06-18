import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient, withTenant } from "../../../shared/db";
import { notifications } from "../../../../../drizzle/schema.pg";
import { SignatureContextReaderDrizzle, SignatureNotificationWriterDrizzle } from "./signature-context-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9964351;
const UID_B = 9964352;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : lecture du contexte devis/client/artisan (création du lien de signature) + écriture de
// notification, toutes deux SOUS LE TENANT (withTenant). Vérifie le round-trip sous A, l'anti-IDOR
// (B ne voit pas le devis de A → contexte null) et l'isolation RLS de la notification écrite.
describe.skipIf(!URL)("SignatureContextReaderDrizzle / NotificationWriterDrizzle (RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new SignatureContextReaderDrizzle(app.db);
  const writer = new SignatureNotificationWriterDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let devisA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    await admin.query('delete from notifications where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise",email) values ($1,$2,$3) returning id', [UID_A, "Sig Ctx A", "a@sig.fr"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Sig Ctx B"])).rows[0].id;
    const clientA = (await admin.query('insert into clients ("artisanId",nom,prenom,email) values ($1,$2,$3,$4) returning id', [artisanA, "Durand", "Léa", "lea@cli.fr"])).rows[0].id;
    devisA = (await admin.query('insert into devis ("artisanId","clientId",numero,objet,"totalTTC",statut) values ($1,$2,$3,$4,$5,$6) returning id', [artisanA, clientA, "SC-A", "Pose carrelage", "480.00", "envoye"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getDevisContext (tenant A) : round-trip devis + client + artisan", async () => {
    const r = await reader.getDevisContext(ctx(artisanA), devisA);
    expect(r).not.toBeNull();
    expect(r!.devis.numero).toBe("SC-A");
    expect(r!.devis.objet).toBe("Pose carrelage");
    expect(r!.devis.totalTTC).toBe(480);
    expect(r!.client).toEqual({ email: "lea@cli.fr", prenom: "Léa", nom: "Durand" });
    expect(r!.artisan).toEqual({ nomEntreprise: "Sig Ctx A", email: "a@sig.fr" });
  });

  it("anti-IDOR : B ne voit pas le devis de A → contexte null", async () => {
    expect(await reader.getDevisContext(ctx(artisanB), devisA)).toBeNull();
  });

  it("devis inconnu → null", async () => {
    expect(await reader.getDevisContext(ctx(artisanA), 987654321)).toBeNull();
  });

  it("notify : insère une notification scopée au tenant + isolation RLS (B ne la voit pas)", async () => {
    await writer.notify(ctx(artisanA), { type: "succes", titre: "Devis signé", message: "Le devis SC-A est signé", lien: "/devis/1" });
    const seenByA = await withTenant(app.db, ctx(artisanA), (tx) =>
      tx.select().from(notifications).where(eq(notifications.artisanId, artisanA)),
    );
    expect(seenByA).toHaveLength(1);
    expect(seenByA[0].type).toBe("succes");
    expect(seenByA[0].titre).toBe("Devis signé");
    const seenByB = await withTenant(app.db, ctx(artisanB), (tx) =>
      tx.select().from(notifications).where(eq(notifications.artisanId, artisanA)),
    );
    expect(seenByB).toEqual([]);
  });
});
