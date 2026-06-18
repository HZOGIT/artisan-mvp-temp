import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ModeleDevisRepositoryDrizzle } from "../../infra/modele-devis-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9944601;
const UB = 9944602;
let seq = 0;
const nom = () => `Trame-${++seq}`;
const ligne = (over = {}) => ({ designation: "Prestation", quantite: "2.00", prixUnitaireHT: "100.00", ...over });

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

describe.skipIf(!URL)("modelesDevis.router e2e (HTTP → tRPC → use-case → repo → RLS, agrégat)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from modeles_devis_lignes where "modeleId" in (select id from modeles_devis where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
    await admin.query('delete from modeles_devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      await admin.query('insert into artisans ("userId") values ($1)', [uid]);
    }
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), modeleDevisRepo: new ModeleDevisRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → modelesDevis.list 401", async () => {
    expect((await q(server, "modelesDevis.list", undefined)).statusCode).toBe(401);
  });

  it("create avec 2 lignes + getById → agrégat (lignes ordonnées, défauts PG)", async () => {
    const tA = await token(UA);
    const created = await mut(server, "modelesDevis.create", { nom: nom(), lignes: [ligne({ ordre: 2, designation: "B" }), ligne({ ordre: 1, designation: "A" })] }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    const agg = (await q(server, "modelesDevis.getById", { id }, tA)).json().result.data as { lignes: Array<{ designation: string; unite: string; tauxTVA: string }> };
    expect(agg.lignes.map((l) => l.designation)).toEqual(["A", "B"]);
    expect(agg.lignes[0].unite).toBe("unité");
    expect(agg.lignes[0].tauxTVA).toBe("20.00");
  });

  it("list est léger (lignes=[]) et scopé au tenant", async () => {
    const tA = await token(UA);
    const list = (await q(server, "modelesDevis.list", undefined, tA)).json().result.data as Array<{ lignes: unknown[] }>;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m) => m.lignes.length === 0)).toBe(true);
  });

  it("validations → 400 : nom vide ; ligne designation vide ; tauxTVA/remise hors [0,100]", async () => {
    const tA = await token(UA);
    expect((await mut(server, "modelesDevis.create", { nom: "" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "modelesDevis.create", { nom: nom(), lignes: [ligne({ designation: "" })] }, tA)).statusCode).toBe(400);
    expect((await mut(server, "modelesDevis.create", { nom: nom(), lignes: [ligne({ tauxTVA: "150.00" })] }, tA)).statusCode).toBe(400);
    expect((await mut(server, "modelesDevis.create", { nom: nom(), lignes: [ligne({ remise: "150.00" })] }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le modèle de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await mut(server, "modelesDevis.create", { nom: "Secret", lignes: [ligne()] }, tA)).json().result.data.id as number;
    expect((await q(server, "modelesDevis.getById", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "modelesDevis.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await mut(server, "modelesDevis.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await mut(server, "modelesDevis.delete", { id }, tB)).statusCode).toBe(404);
    expect((await q(server, "modelesDevis.getById", { id }, tA)).json().result.data.nom).toBe("Secret");
  });

  it("update remplace les lignes (2→1) via l'API et préserve l'en-tête non fourni", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "modelesDevis.create", { nom: "Avant", notes: "Garde", lignes: [ligne(), ligne()] }, tA)).json().result.data.id as number;
    const maj = await mut(server, "modelesDevis.update", { id, nom: "Après", lignes: [ligne({ designation: "Unique" })] }, tA);
    expect(maj.statusCode).toBe(200);
    const agg = (await q(server, "modelesDevis.getById", { id }, tA)).json().result.data as { nom: string; notes: string; lignes: Array<{ designation: string }> };
    expect(agg.nom).toBe("Après");
    expect(agg.notes).toBe("Garde"); // préservé
    expect(agg.lignes).toHaveLength(1);
    expect(agg.lignes[0].designation).toBe("Unique");
  });

  it("INVARIANT : unicité du défaut via l'API (le 2e défaut retombe le 1er, lignes du 1er préservées)", async () => {
    const tA = await token(UA);
    const id1 = (await mut(server, "modelesDevis.create", { nom: "D1", isDefault: true, lignes: [ligne(), ligne()] }, tA)).json().result.data.id as number;
    await mut(server, "modelesDevis.create", { nom: "D2", isDefault: true, lignes: [ligne()] }, tA);
    const list = (await q(server, "modelesDevis.list", undefined, tA)).json().result.data as Array<{ isDefault: boolean }>;
    expect(list.filter((m) => m.isDefault).length).toBe(1); // un seul défaut
    const m1 = (await q(server, "modelesDevis.getById", { id: id1 }, tA)).json().result.data as { isDefault: boolean; lignes: unknown[] };
    expect(m1.isDefault).toBe(false); // retombé
    expect(m1.lignes).toHaveLength(2); // ⚠️ lignes préservées (pas de remplacement par la rétrogradation)
  });
});
