import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../app";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-upload";
const UID = 9991121;

async function signToken(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@test.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

// Corps multipart/form-data manuel (un seul champ fichier `logo`).
function multipartBody(boundary: string, mimetype: string, bytes: Buffer): Buffer {
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="logo.bin"\r\nContent-Type: ${mimetype}\r\n\r\n`, "utf8");
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return Buffer.concat([head, bytes, tail]);
}

describe.skipIf(!URL)("/api/upload-logo (HORS-tRPC, auth cookie + multipart)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let artisanId = 0;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId" = $1', [UID]);
    await admin.query("delete from users where id = $1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email) values ($1, $2)", [UID, `u${UID}@test.fr`]);
    artisanId = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID])).rows[0].id;
    app = buildApp({ jwtSecret: SECRET });
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  const upload = (mimetype: string, bytes: Buffer, cookie?: string) => {
    const boundary = "----testboundary123";
    return app.inject({
      method: "POST",
      url: "/api/upload-logo",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, ...(cookie ? { cookie } : {}) },
      payload: multipartBody(boundary, mimetype, bytes),
    });
  };

  it("sans cookie → 401", async () => {
    const res = await upload("image/png", Buffer.from([1, 2, 3]));
    expect(res.statusCode).toBe(401);
  });

  it("mime non supporté → 400", async () => {
    const token = await signToken(UID);
    const res = await upload("image/gif", Buffer.from([1, 2, 3]), `token=${token}`);
    expect(res.statusCode).toBe(400);
  });

  it("upload PNG valide → 200 + logo base64 persisté", async () => {
    const token = await signToken(UID);
    const res = await upload("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47]), `token=${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().logoUrl).toMatch(/^data:image\/png;base64,/);
    const { rows } = await admin.query("select logo from artisans where id=$1", [artisanId]);
    expect(rows[0].logo).toMatch(/^data:image\/png;base64,/);
  });

  it("DELETE → 200 + logo effacé", async () => {
    const token = await signToken(UID);
    const res = await app.inject({ method: "DELETE", url: "/api/upload-logo", headers: { cookie: `token=${token}` } });
    expect(res.statusCode).toBe(200);
    const { rows } = await admin.query("select logo from artisans where id=$1", [artisanId]);
    expect(rows[0].logo).toBeNull();
  });

  it("isolation tRPC : le multipart n'altère pas le JSON tRPC (health 200)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trpc/health" });
    expect(res.statusCode).toBe(200);
  });
});
