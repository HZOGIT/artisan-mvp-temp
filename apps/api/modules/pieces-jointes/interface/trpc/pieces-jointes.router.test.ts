import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { InMemoryStoragePort } from "../../../../shared/ports/fakes";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9960001;
const EMAIL = `upj${UID}@t.fr`;
const AID = 9960001;

const jwt = () =>
  new SignJWT({ userId: UID, email: EMAIL })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

describe.skipIf(!URL)("piecesJointes.router (L3 e2e, fake repo)", () => {
  const admin = new Pool({ connectionString: URL });
  const fakeStorage = new InMemoryStoragePort();
  let app: ReturnType<typeof buildApp>;
  let token: string;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans (id, "userId","nomEntreprise") values ($1,$2,$3) on conflict do nothing', [AID, UID, "PJ Test SARL"]);
    app = buildApp({ jwtSecret: SECRET, storage: fakeStorage });
    token = await jwt();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("listByDevis sans cookie → 401", async () => {
    const res = await injectTrpc(app, "GET", "piecesJointes.listByDevis", { devisId: 1 });
    expect(res.statusCode).toBe(401);
  });

  it("listByDevis (cookie) devisId inconnu → liste vide", async () => {
    const res = await injectTrpc(app, "GET", "piecesJointes.listByDevis", { devisId: 99999 }, token);
    expect(res.statusCode).toBe(200);
    const env = res.json() as { result: { data: unknown[] } };
    expect(Array.isArray(env.result.data)).toBe(true);
  });

  it("listByFacture (cookie) → 200 liste vide", async () => {
    const res = await injectTrpc(app, "GET", "piecesJointes.listByFacture", { factureId: 99999 }, token);
    expect(res.statusCode).toBe(200);
  });

  it("delete (cookie) id inexistant → 404 (NotFoundError)", async () => {
    const res = await injectTrpc(app, "POST", "piecesJointes.delete", { id: 99999 }, token);
    expect(res.statusCode).toBe(404);
  });

  it("delete sans cookie → 401", async () => {
    const res = await injectTrpc(app, "POST", "piecesJointes.delete", { id: 1 });
    expect(res.statusCode).toBe(401);
  });
});
