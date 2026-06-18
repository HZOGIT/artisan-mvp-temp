import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { EcritureRepositoryDrizzle } from "../../infra/ecriture-repository-drizzle";
import type { TenantContext } from "../../../../shared/tenant";
import type { CreateEcritureInput } from "../../domain/ecriture";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9942301;
const UB = 9942302;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

const piece = (factureId: number): CreateEcritureInput[] => {
  const d = new Date("2026-06-14T00:00:00Z");
  return [
    { dateEcriture: d, journal: "VE", numeroCompte: "411000", libelle: "F1", pieceRef: "FAC-1", debit: "120.00", factureId },
    { dateEcriture: d, journal: "VE", numeroCompte: "706000", libelle: "F1", pieceRef: "FAC-1", credit: "100.00", factureId },
    { dateEcriture: d, journal: "VE", numeroCompte: "445711", libelle: "F1", pieceRef: "FAC-1", credit: "20.00", factureId },
  ];
};

describe.skipIf(!URL)("ecritures.router e2e (lecture compta — HTTP → tRPC → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;
  const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

  const purge = async (uid: number) => {
    await admin.query('delete from ecritures_comptables where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
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
    // Seed une pièce de vente pour A (via le repo Drizzle, app_tenant + RLS).
    await new EcritureRepositoryDrizzle(app.db).createMany(ctx(artisanA), piece(701));
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), ecritureRepo: new EcritureRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → ecritures.list 401", async () => {
    expect((await q(server, "ecritures.list", undefined)).statusCode).toBe(401);
  });

  it("list + byFacture + balance scopés au tenant A", async () => {
    const tA = await token(UA);
    expect((await q(server, "ecritures.list", undefined, tA)).json().result.data.length).toBe(3);
    expect((await q(server, "ecritures.byFacture", { factureId: 701 }, tA)).json().result.data.length).toBe(3);
    const balance = (await q(server, "ecritures.balance", undefined, tA)).json().result.data as Array<{ numeroCompte: string; solde: string }>;
    expect(balance.find((l) => l.numeroCompte === "411000")!.solde).toBe("120.00");
    expect(balance.reduce((s, l) => s + Number(l.solde), 0)).toBeCloseTo(0, 2); // Σsoldes = 0
  });

  it("grandLivre filtré + exportFec (header 18 colonnes)", async () => {
    const tA = await token(UA);
    const gl = (await q(server, "ecritures.grandLivre", { numeroCompte: "411000" }, tA)).json().result.data as unknown[];
    expect(gl.length).toBe(1);
    const fec = (await q(server, "ecritures.exportFec", { debut: "2026-06-01", fin: "2026-06-30" }, tA)).json().result.data as string;
    expect(fec.split("\n")[0].split("\t").length).toBe(18);
    expect(fec.split("\n").length).toBe(4); // header + 3 lignes
  });

  it("isolation cross-tenant : B ne voit pas les écritures de A", async () => {
    const tB = await token(UB);
    expect((await q(server, "ecritures.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await q(server, "ecritures.byFacture", { factureId: 701 }, tB)).json().result.data).toEqual([]);
    expect((await q(server, "ecritures.balance", undefined, tB)).json().result.data).toEqual([]);
  });
});
