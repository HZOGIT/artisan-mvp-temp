import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { BcryptPasswordHasher } from "../../../../shared/ports/password-hasher-bcrypt";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9941121;
const EMAIL = `u${UID}@t.fr`;
const PASSWORD = "IbanTest123!";
const VALID_IBAN = "FR7630006000011234567890189";

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `artisan.*`) : profil entreprise du tenant. Toujours scopé `ctx.tenant`.
describe.skipIf(!URL)("artisan.router e2e (profil protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    const hash = await new BcryptPasswordHasher().hash(PASSWORD);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,$3,'artisan')", [UID, EMAIL, hash]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Avant"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getProfile / updateProfile sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "artisan.getProfile", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "artisan.updateProfile", { nomEntreprise: "X" })).statusCode).toBe(401);
  });

  it("getProfile (cookie) → 200 + profil du tenant", async () => {
    const res = await injectTrpc(app, "GET", "artisan.getProfile", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data?.nomEntreprise).toBe("Avant");
  });

  it("updateProfile (cookie) → 200 et getProfile reflète la mise à jour", async () => {
    const tok = await jwt(UID);
    const upd = await injectTrpc(app, "POST", "artisan.updateProfile", { nomEntreprise: "Après", ville: "Lyon" }, tok);
    expect(upd.statusCode).toBe(200);
    const res = await injectTrpc(app, "GET", "artisan.getProfile", undefined, tok);
    expect(res.json().result.data?.nomEntreprise).toBe("Après");
    expect(res.json().result.data?.ville).toBe("Lyon");
  });

  it("validation : email invalide → 400 ; spécialité hors enum → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "POST", "artisan.updateProfile", { email: "pas-un-email" }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "artisan.updateProfile", { specialite: "astronaute" }, tok)).statusCode).toBe(400);
  });

  it("validation : siret invalide (format / clé de contrôle) → 400 ; siret vide ou valide → 200", async () => {
    const tok = await jwt(UID);
    // 14 chiffres mais clé de contrôle incorrecte
    expect((await injectTrpc(app, "POST", "artisan.updateProfile", { siret: "11111111111111" }, tok)).statusCode).toBe(400);
    // trop court
    expect((await injectTrpc(app, "POST", "artisan.updateProfile", { siret: "1234" }, tok)).statusCode).toBe(400);
    // 15 chiffres
    expect((await injectTrpc(app, "POST", "artisan.updateProfile", { siret: "123456789012345" }, tok)).statusCode).toBe(400);
    // vider le siret → accepté
    expect((await injectTrpc(app, "POST", "artisan.updateProfile", { siret: "" }, tok)).statusCode).toBe(200);
    // SIRET valide (Luhn OK) → accepté
    expect((await injectTrpc(app, "POST", "artisan.updateProfile", { siret: "73282932000074" }, tok)).statusCode).toBe(200);
  });

  it("IBAN sans currentPassword → 400", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "artisan.updateProfile", { iban: VALID_IBAN }, tok);
    expect(res.statusCode).toBe(400);
  });

  it("IBAN avec mauvais mot de passe → 401", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "artisan.updateProfile", { iban: VALID_IBAN, currentPassword: "mauvais" }, tok);
    expect(res.statusCode).toBe(401);
  });

  it("IBAN avec mot de passe correct → 200 et IBAN mis à jour", async () => {
    const tok = await jwt(UID);
    const res = await injectTrpc(app, "POST", "artisan.updateProfile", { iban: VALID_IBAN, currentPassword: PASSWORD }, tok);
    expect(res.statusCode).toBe(200);
    const profile = await injectTrpc(app, "GET", "artisan.getProfile", undefined, tok);
    expect(profile.json().result.data?.iban).toBe(VALID_IBAN);
  });
});
