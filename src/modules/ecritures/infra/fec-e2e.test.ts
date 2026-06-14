import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../app";
import { createDbClient } from "../../../shared/db";
import { DrizzleTenantResolver } from "../../../shared/tenant/drizzle-tenant-resolver";
import { FactureRepositoryDrizzle } from "../../factures/infra/facture-repository-drizzle";
import { DevisReaderDrizzle } from "../../factures/infra/devis-reader-drizzle";
import { EcritureRepositoryDrizzle } from "./ecriture-repository-drizzle";
import { FactureReaderDrizzle } from "./facture-reader-drizzle";
import { ComptaEcrituresAdapter } from "./compta-ecritures-adapter";
import type { TenantContext } from "../../../shared/tenant";

// e2e FEC bout-en-bout : facture (HTTP/tRPC) → génération réelle des écritures comptables en
// base, via le ComptaPort branché sur l'adapter ecritures. ⚠️ Invariant Σdébit=Σcrédit + RLS.
const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9942101;
const UB = 9942102;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok: string) {
  return app.inject({ method: "POST", url: `/api/trpc/${path}`, headers: { "content-type": "application/json", cookie: `token=${tok}` }, payload: JSON.stringify(input) });
}

describe.skipIf(!URL)("FEC e2e (facture → écritures comptables équilibrées en base)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const ecritureRepo = new EcritureRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let server: ReturnType<typeof buildApp>;
  const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

  const purge = async (uid: number) => {
    await admin.query('delete from ecritures_comptables where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from parametres_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
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
    // ⚠️ adapter sur app.db (même connexion app_tenant que le repo factures) → la lecture facture voit le seed.
    const compta = new ComptaEcrituresAdapter(ecritureRepo, new FactureReaderDrizzle(app.db));
    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(app.db),
      factureRepo: new FactureRepositoryDrizzle(app.db),
      devisReader: new DevisReaderDrizzle(app.db),
      compta,
    });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("envoyer → pièce de VENTE équilibrée (411 débit TTC / 706 crédit HT / 445 crédit TVA) ; paiement → pièce BANQUE", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "factures.create", { clientId: clientA, objet: "Travaux" }, tA)).json().result.data.id as number;
    await mut(server, "factures.addLigne", { factureId: id, designation: "Pose", quantite: "1", prixUnitaireHT: "100.00", tauxTVA: "20" }, tA);

    // Émission → génération de la pièce de vente FEC en base.
    expect((await mut(server, "factures.envoyer", { id }, tA)).json().result.data.statut).toBe("envoyee");
    const ve = (await ecritureRepo.listByFacture(ctx(artisanA), id)).filter((e) => e.journal === "VE");
    expect(ve.length).toBe(3);
    expect(ve.find((e) => e.numeroCompte === "411000")!.debit).toBe("120.00");
    expect(ve.find((e) => e.numeroCompte === "706000")!.credit).toBe("100.00");
    expect(ve.find((e) => e.numeroCompte === "445711")!.credit).toBe("20.00");
    const dVE = ve.reduce((s, e) => s + Number(e.debit), 0);
    const cVE = ve.reduce((s, e) => s + Number(e.credit), 0);
    expect(dVE).toBeCloseTo(cVE, 2); // Σdébit = Σcrédit

    // Paiement soldant → pièce d'encaissement (BQ) en plus, VE inchangée.
    expect((await mut(server, "factures.enregistrerPaiement", { id, montant: "120.00" }, tA)).json().result.data.statut).toBe("payee");
    const toutes = await ecritureRepo.listByFacture(ctx(artisanA), id);
    const bq = toutes.filter((e) => e.journal === "BQ");
    expect(bq.length).toBe(2);
    expect(bq.find((e) => e.numeroCompte === "512000")!.debit).toBe("120.00");
    expect(bq.find((e) => e.numeroCompte === "411000")!.credit).toBe("120.00");
    expect(toutes.filter((e) => e.journal === "VE").length).toBe(3); // VE intacte
    const dAll = toutes.reduce((s, e) => s + Number(e.debit), 0);
    const cAll = toutes.reduce((s, e) => s + Number(e.credit), 0);
    expect(dAll).toBeCloseTo(cAll, 2); // l'ensemble reste équilibré
  });

  it("markAsPaid → pièces VENTE + ENCAISSEMENT générées, ensemble équilibré Σdébit=Σcrédit", async () => {
    const tA = await token(UA);
    const id = (await mut(server, "factures.create", { clientId: clientA, objet: "Solde direct" }, tA)).json().result.data.id as number;
    await mut(server, "factures.addLigne", { factureId: id, designation: "Pose", quantite: "1", prixUnitaireHT: "200.00", tauxTVA: "20" }, tA);
    await mut(server, "factures.envoyer", { id }, tA); // facture émise (TTC = 240)
    // markAsPaid : écrase montantPaye + payee + génère VENTE + ENCAISSEMENT via le vrai ComptaPort
    const paid = await mut(server, "factures.markAsPaid", { id, montantPaye: "240.00", datePaiement: "2026-07-01" }, tA);
    expect(paid.json().result.data.statut).toBe("payee");
    const toutes = await ecritureRepo.listByFacture(ctx(artisanA), id);
    expect(toutes.filter((e) => e.journal === "VE").length).toBe(3); // 411/706/445
    expect(toutes.filter((e) => e.journal === "BQ").length).toBe(2); // 512/411
    const d = toutes.reduce((s, e) => s + Number(e.debit), 0);
    const c = toutes.reduce((s, e) => s + Number(e.credit), 0);
    expect(d).toBeCloseTo(c, 2); // ⚠️ INVARIANT FEC : Σdébit = Σcrédit
    expect(d).toBeCloseTo(480, 2); // VE débit 411=240 + BQ débit 512=240 = 480
  });

  it("isolation cross-tenant : B ne lit pas les écritures de A", async () => {
    expect((await ecritureRepo.list(ctx(artisanB))).length).toBe(0);
  });
});
