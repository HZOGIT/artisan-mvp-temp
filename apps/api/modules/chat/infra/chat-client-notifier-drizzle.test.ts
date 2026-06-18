import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { FakeEmailPort, FakeRateLimiter } from "../../../shared/ports/fakes";
import { ChatClientNotifierDrizzle } from "./chat-client-notifier-drizzle";
import type { Conversation } from "../domain/chat";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9956271;
const UID_B = 9956272;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });
const conv = (artisanId: number, clientId: number): Conversation => ({
  id: 1, artisanId, clientId, sujet: null, statut: "ouverte", dernierMessage: null,
} as Conversation);

// L2 RLS + ports : notification email d'un nouveau message chat. Lit client/artisan/lien portail SOUS
// LE TENANT (RLS), applique le rate-limit anti-spam, puis envoie via l'EmailPort. On vérifie l'envoi
// (lien portail), le no-op sans email client, le no-op si rate-limit atteint, et l'anti-IDOR (client
// d'un autre tenant → rien envoyé).
describe.skipIf(!URL)("ChatClientNotifierDrizzle (RLS + email + rate-limit)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let email = new FakeEmailPort();
  let limiter = new FakeRateLimiter();
  const make = () => new ChatClientNotifierDrizzle(app.db, email, limiter, "https://app.test");
  let artisanA = 0;
  let artisanB = 0;
  let clientWithEmail = 0;
  let clientNoEmail = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from client_portal_access where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Chat A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Chat B"])).rows[0].id;
    clientWithEmail = (await admin.query('insert into clients ("artisanId",nom,prenom,email) values ($1,$2,$3,$4) returning id', [artisanA, "Faure", "Léa", "lea@cli.fr"])).rows[0].id;
    clientNoEmail = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "SansEmail"])).rows[0].id;
    await admin.query('insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4,$5,true)', [clientWithEmail, artisanA, "portaltok-9956271", "lea@cli.fr", new Date(Date.now() + 30 * 86400000)]);
  });

  beforeEach(() => {
    email = new FakeEmailPort();
    limiter = new FakeRateLimiter();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("envoie l'email au client (lien portail) + vérifie la clé rate-limit", async () => {
    await make().notifyNewMessage(ctx(artisanA), conv(artisanA, clientWithEmail), "Bonjour, où en est mon devis ?");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("lea@cli.fr");
    expect(email.sent[0].body).toContain("https://app.test/portail/portaltok-9956271");
    expect(limiter.checked).toEqual([`chat:${artisanA}`]);
  });

  it("client sans email → aucun envoi (et pas de check rate-limit)", async () => {
    await make().notifyNewMessage(ctx(artisanA), conv(artisanA, clientNoEmail), "msg");
    expect(email.sent).toHaveLength(0);
    expect(limiter.checked).toEqual([]); // sort avant le rate-limit
  });

  it("rate-limit atteint → aucun envoi (message in-app conservé ailleurs)", async () => {
    limiter.denyKey(`chat:${artisanA}`);
    await make().notifyNewMessage(ctx(artisanA), conv(artisanA, clientWithEmail), "msg");
    expect(email.sent).toHaveLength(0);
    expect(limiter.checked).toEqual([`chat:${artisanA}`]);
  });

  it("anti-IDOR : client d'un autre tenant → rien envoyé", async () => {
    await make().notifyNewMessage(ctx(artisanB), conv(artisanB, clientWithEmail), "msg");
    expect(email.sent).toHaveLength(0);
  });
});
