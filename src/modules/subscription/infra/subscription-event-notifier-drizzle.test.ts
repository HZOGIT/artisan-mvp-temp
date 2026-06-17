import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient, withTenant } from "../../../shared/db";
import { notifications } from "../../../../drizzle/schema.pg";
import { FakeEmailPort } from "../../../shared/ports/fakes";
import { SubscriptionEventNotifierDrizzle } from "./subscription-event-notifier-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9945161;
const UID_B = 9945162;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 : notifier d'événements abonnement (webhook). `notifyArtisan` insère une notification SOUS LE
// TENANT (RLS) ; `emailArtisanOwner` résout artisans.userId → users.email (tables identité HORS RLS)
// puis envoie via l'EmailPort. Vérifie l'insertion scopée + isolation RLS, et l'email au propriétaire.
describe.skipIf(!URL)("SubscriptionEventNotifierDrizzle (RLS notif + email owner)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let email = new FakeEmailPort();
  const make = () => new SubscriptionEventNotifierDrizzle(app.db, email);
  let artisanA = 0;
  let artisanB = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    await admin.query('delete from notifications where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
    await admin.query("delete from users where id = any($1)", [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    for (const uid of [UID_A, UID_B]) await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `owner${uid}@op.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Sub A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Sub B"])).rows[0].id;
  });

  beforeEach(() => {
    email = new FakeEmailPort();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("notifyArtisan : insère la notification scopée au tenant + isolation RLS (B ne la voit pas)", async () => {
    await make().notifyArtisan(artisanA, { type: "succes", titre: "Abonnement actif", message: "Merci !", lien: "/abonnement" });
    const seenByA = await withTenant(app.db, ctx(artisanA), (tx) =>
      tx.select().from(notifications).where(eq(notifications.artisanId, artisanA)),
    );
    expect(seenByA).toHaveLength(1);
    expect(seenByA[0].titre).toBe("Abonnement actif");
    const seenByB = await withTenant(app.db, ctx(artisanB), (tx) =>
      tx.select().from(notifications).where(eq(notifications.artisanId, artisanA)),
    );
    expect(seenByB).toEqual([]);
  });

  it("emailArtisanOwner : envoie au propriétaire résolu via artisans.userId → users.email", async () => {
    await make().emailArtisanOwner(artisanA, "Paiement reçu", "<p>OK</p>");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe(`owner${UID_A}@op.fr`);
    expect(email.sent[0].subject).toBe("Paiement reçu");
  });

  it("emailArtisanOwner : artisan inexistant → aucun envoi", async () => {
    await make().emailArtisanOwner(987654321, "X", "<p>x</p>");
    expect(email.sent).toHaveLength(0);
  });
});
