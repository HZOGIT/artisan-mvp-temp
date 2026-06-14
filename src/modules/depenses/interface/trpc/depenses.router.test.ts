import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DepenseRepositoryDrizzle } from "../../infra/depense-repository-drizzle";
import { CategorieDepenseRepositoryDrizzle } from "../../../categories-depenses/infra/categorie-depense-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9890101;
const UB = 9890102;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return app.inject({
    method: "POST",
    url: `/api/trpc/${path}`,
    headers: { "content-type": "application/json", ...(tok ? { cookie: `token=${tok}` } : {}) },
    payload: JSON.stringify(input),
  });
}
function callQuery(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return app.inject({ method: "GET", url: `/api/trpc/${path}${qs}`, headers: tok ? { cookie: `token=${tok}` } : {} });
}

describe.skipIf(!URL)("depenses.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let chantierB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from depenses where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from categories_depenses where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from chantiers where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    chantierB = (
      await admin.query('insert into chantiers ("artisanId","clientId",reference,nom) values ($1,$2,$3,$4) returning id', [
        artisanB,
        clientB,
        "CH-B-DEP",
        "Chantier B",
      ])
    ).rows[0].id;
    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(app.db),
      depenseRepo: new DepenseRepositoryDrizzle(app.db),
      categorieDepenseRepo: new CategorieDepenseRepositoryDrizzle(app.db),
    });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → depenses.list 401", async () => {
    expect((await callQuery(server, "depenses.list", undefined)).statusCode).toBe(401);
  });

  it("catégories (parité client trpc.depenses.*Categorie) : 401 / scopé / create→list / isolation / update+delete", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    expect((await callQuery(server, "depenses.getCategories", undefined)).statusCode).toBe(401);
    expect((await callQuery(server, "depenses.getCategories", undefined, tA)).json().result.data).toEqual([]);
    const created = await callMutation(server, "depenses.createCategorie", { nom: "Carburant", couleur: "#112233", plafondMensuel: 500 }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    const listA = (await callQuery(server, "depenses.getCategories", undefined, tA)).json().result.data as Array<{ id: number; nom: string }>;
    expect(listA).toContainEqual(expect.objectContaining({ id, nom: "Carburant" }));
    expect((await callQuery(server, "depenses.getCategories", undefined, tB)).json().result.data).toEqual([]); // isolation
    expect((await callMutation(server, "depenses.updateCategorie", { id, actif: false }, tA)).json().result.data).toEqual({ success: true });
    expect((await callMutation(server, "depenses.deleteCategorie", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "depenses.getCategories", undefined, tA)).json().result.data).toEqual([]);
  });

  it("create dérive TVA/TTC côté serveur + list scopé tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(
      server,
      "depenses.create",
      { dateDepense: "2026-06-15", categorie: "fournitures", montantHt: "100.00", tauxTva: "20" },
      tA,
    );
    expect(created.statusCode).toBe(200);
    const data = created.json().result.data as { id: number; numero: string; montantTva: string; montantTtc: string; statut: string; userId: number };
    expect(data.montantTva).toBe("20.00");
    expect(data.montantTtc).toBe("120.00");
    expect(data.statut).toBe("brouillon");
    expect(data.numero).toMatch(/^DEP-\d{5}$/); // numéro généré côté serveur
    expect(data.userId).toBe(UA); // userId forcé au créateur
    const list = await callQuery(server, "depenses.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((d) => d.id === data.id)).toBe(true);
  });

  it("create applique le taux par défaut 20% si tauxTva absent", async () => {
    const tA = await token(UA);
    const created = await callMutation(
      server,
      "depenses.create",
      { dateDepense: "2026-06-15", categorie: "divers", montantHt: "50.00" },
      tA,
    );
    const data = created.json().result.data as { montantTva: string; montantTtc: string };
    expect(data.montantTva).toBe("10.00");
    expect(data.montantTtc).toBe("60.00");
  });

  it("numéro auto-généré, scopé tenant et incrémenté (parité legacy getNextDepenseNumero)", async () => {
    const tB = await token(UB);
    // Tenant B vierge → première dépense = DEP-00001, suivante = DEP-00002.
    const d1 = await callMutation(server, "depenses.create", { dateDepense: "2026-06-15", categorie: "x", montantHt: "1.00" }, tB);
    const d2 = await callMutation(server, "depenses.create", { dateDepense: "2026-06-15", categorie: "x", montantHt: "1.00" }, tB);
    const n1 = d1.json().result.data.numero as string;
    const n2 = d2.json().result.data.numero as string;
    expect(n1).toBe("DEP-00001");
    expect(n2).toBe("DEP-00002");
  });

  it("validation : montant non décimal → 400 ; taux > 100 → 400", async () => {
    const tA = await token(UA);
    const b = { dateDepense: "2026-06-15", categorie: "x" };
    expect((await callMutation(server, "depenses.create", { ...b, montantHt: "abc" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "depenses.create", { ...b, montantHt: "10", tauxTva: "150" }, tA)).statusCode).toBe(400);
  });

  it("ANTI-IDOR-FK : create avec un clientId/chantierId d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    const base = { dateDepense: "2026-06-15", categorie: "achat", montantHt: "10.00" };
    expect((await callMutation(server, "depenses.create", { ...base, clientId: clientB }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "depenses.create", { ...base, chantierId: chantierB }, tA)).statusCode).toBe(404);
  });

  it("ANTI-IDOR-FK : create avec un clientId du tenant → OK", async () => {
    const tA = await token(UA);
    const created = await callMutation(
      server,
      "depenses.create",
      { dateDepense: "2026-06-15", categorie: "achat", montantHt: "10.00", clientId: clientA },
      tA,
    );
    expect(created.statusCode).toBe(200);
    expect((created.json().result.data as { clientId: number }).clientId).toBe(clientA);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la dépense de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (
      await callMutation(server, "depenses.create", { dateDepense: "2026-06-15", categorie: "secret", montantHt: "99.00" }, tA)
    ).json().result.data.id as number;
    expect((await callQuery(server, "depenses.getById", { id }, tB)).statusCode).toBe(404);
    const listB = (await callQuery(server, "depenses.list", undefined, tB)).json().result.data as Array<{ id: number }>;
    expect(listB.some((d) => d.id === id)).toBe(false); // B ne voit jamais la dépense de A
    expect((await callMutation(server, "depenses.update", { id, description: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "depenses.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "depenses.getById", { id }, tA)).json().result.data.categorie).toBe("secret");
  });

  it("update recalcule la TVA quand montantHt change ; champ non concerné préservé", async () => {
    const tA = await token(UA);
    const id = (
      await callMutation(
        server,
        "depenses.create",
        { dateDepense: "2026-06-15", categorie: "outil", montantHt: "100.00", tauxTva: "20", fournisseur: "ACME" },
        tA,
      )
    ).json().result.data.id as number;
    const maj = await callMutation(server, "depenses.update", { id, montantHt: "200.00" }, tA);
    const data = maj.json().result.data as { montantHt: string; montantTva: string; montantTtc: string; fournisseur: string };
    expect(data.montantTva).toBe("40.00");
    expect(data.montantTtc).toBe("240.00");
    expect(data.fournisseur).toBe("ACME"); // préservé
    expect((await callMutation(server, "depenses.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "depenses.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("id inexistant du même tenant : getById / update / delete → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "depenses.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "depenses.update", { id: 999999999, description: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "depenses.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });
});
