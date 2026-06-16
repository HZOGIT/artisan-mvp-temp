import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9948191;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `chat.*`) : messagerie support artisan↔client (toutes protégées).
describe.skipIf(!URL)("chat.router e2e (messagerie protégée)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Chat SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getConversations / getMessages / sendMessage sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "chat.getConversations", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "GET", "chat.getMessages", { conversationId: 1 })).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "chat.sendMessage", { conversationId: 1, contenu: "x" })).statusCode).toBe(401);
  });

  it("getConversations + getUnreadCount (cookie) → 200 (tenant vierge)", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "chat.getConversations", undefined, tok)).statusCode).toBe(200);
    expect((await injectTrpc(app, "GET", "chat.getUnreadCount", undefined, tok)).statusCode).toBe(200);
  });

  it("validation : sendMessage contenu vide → 400 ; startConversation sans clientId → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "POST", "chat.sendMessage", { conversationId: 1, contenu: "" }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "chat.startConversation", { sujet: "Bonjour" }, tok)).statusCode).toBe(400);
  });
});
