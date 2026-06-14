import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ModeleEmailRepositoryDrizzle } from "../../infra/modele-email-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9944401;
const UB = 9944402;
let seq = 0;
const nom = () => `Modele-${++seq}`;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return app.inject({ method: "POST", url: `/api/trpc/${path}`, headers: { "content-type": "application/json", ...(tok ? { cookie: `token=${tok}` } : {}) }, payload: JSON.stringify(input) });
}
function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return app.inject({ method: "GET", url: `/api/trpc/${path}${qs}`, headers: tok ? { cookie: `token=${tok}` } : {} });
}

describe.skipIf(!URL)("modelesEmail.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from modeles_email where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      await admin.query('insert into artisans ("userId") values ($1)', [uid]);
    }
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), modeleEmailRepo: new ModeleEmailRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  const base = (over = {}) => ({ nom: nom(), type: "envoi_devis", sujet: "Votre devis", contenu: "Bonjour", ...over });

  it("sans cookie → modelesEmail.list 401", async () => {
    expect((await q(server, "modelesEmail.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A (défaut isDefault=false)", async () => {
    const tA = await token(UA);
    const created = await mut(server, "modelesEmail.create", base(), tA);
    expect(created.statusCode).toBe(200);
    const m = created.json().result.data as { id: number; isDefault: boolean; type: string };
    expect(m.isDefault).toBe(false);
    expect(m.type).toBe("envoi_devis");
    expect((await q(server, "modelesEmail.list", undefined, tA)).json().result.data.some((x: { id: number }) => x.id === m.id)).toBe(true);
  });

  it("validation : nom/sujet/contenu vide → 400 ; type hors enum → 400", async () => {
    const tA = await token(UA);
    expect((await mut(server, "modelesEmail.create", base({ nom: "" }), tA)).statusCode).toBe(400);
    expect((await mut(server, "modelesEmail.create", base({ sujet: "" }), tA)).statusCode).toBe(400);
    expect((await mut(server, "modelesEmail.create", base({ contenu: "" }), tA)).statusCode).toBe(400);
    expect((await mut(server, "modelesEmail.create", base({ type: "inexistant" }), tA)).statusCode).toBe(400);
  });

  it("byType : filtre scopé tenant ; type sans modèle → []", async () => {
    const tA = await token(UA);
    await mut(server, "modelesEmail.create", base({ type: "rappel_paiement", nom: "RP" }), tA);
    const rp = (await q(server, "modelesEmail.byType", { type: "rappel_paiement" }, tA)).json().result.data as Array<{ nom: string }>;
    expect(rp.some((m) => m.nom === "RP")).toBe(true);
    expect(rp.every((m) => m.nom !== "Votre devis")).toBe(true);
    expect((await q(server, "modelesEmail.byType", { type: "autre" }, tA)).json().result.data).toEqual([]);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le modèle de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await mut(server, "modelesEmail.create", base({ sujet: "Secret" }), tA)).json().result.data.id as number;
    expect((await q(server, "modelesEmail.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "modelesEmail.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "modelesEmail.update", { id, sujet: "hack" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "modelesEmail.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "modelesEmail.getById", { id }, tA)).json().result.data.sujet).toBe("Secret");
  });

  it("update partiel + delete OK propriétaire ; id inexistant → 404", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "modelesEmail.create", base({ sujet: "Avant", contenu: "C" }), tA)).json().result.data.id as number;
    const maj = await mut(server, "modelesEmail.update", { id, sujet: "Après" }, tA);
    expect(maj.json().result.data.sujet).toBe("Après");
    expect(maj.json().result.data.contenu).toBe("C"); // préservé
    expect((await mut(server, "modelesEmail.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await q(server, "modelesEmail.getById", { id }, tA)).statusCode).toBe(404);
    expect((await mut(server, "modelesEmail.update", { id: 999999999, sujet: "x" }, tA)).statusCode).toBe(404);
  });

  it("INVARIANT : unicité du défaut par type via l'API (le 2e défaut retombe le 1er, par type)", async () => {
    const tA = await token(UA);
    // Un défaut d'un autre type, qui doit rester intact (règle par type).
    await mut(server, "modelesEmail.create", base({ type: "relance_devis", nom: "RD-def", isDefault: true }), tA);
    // Deux défauts envoi_devis successifs.
    await mut(server, "modelesEmail.create", base({ type: "envoi_devis", nom: "ED1", isDefault: true }), tA);
    await mut(server, "modelesEmail.create", base({ type: "envoi_devis", nom: "ED2", isDefault: true }), tA);
    const envoiDevis = (await q(server, "modelesEmail.byType", { type: "envoi_devis" }, tA)).json().result.data as Array<{ isDefault: boolean }>;
    expect(envoiDevis.filter((m) => m.isDefault).length).toBe(1); // un seul défaut
    const relance = (await q(server, "modelesEmail.byType", { type: "relance_devis" }, tA)).json().result.data as Array<{ isDefault: boolean }>;
    expect(relance.filter((m) => m.isDefault).length).toBe(1); // intact (règle par type)
  });
});
