import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DemandeAvisRepositoryDrizzle } from "./demande-avis-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9960311;
const UID_B = 9960312;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : repository des demandes d'avis. Double cloisonnement (RLS + filtre `artisanId`). On vérifie
// les lectures d'ownership (anti-IDOR cross-tenant → null), le tri « dernière intervention du client »
// et la persistance de `creerDemande` (statut envoyee, artisanId du contexte).
describe.skipIf(!URL)("DemandeAvisRepositoryDrizzle (RLS ownership + création)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new DemandeAvisRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let interOld = 0;
  let interNew = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from demandes_avis where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from interventions where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Dem A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Dem B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanA, "Leroy", "leroy@cli.fr"])).rows[0].id;
    interOld = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,$4) returning id', [artisanA, clientA, "Ancienne", "2026-05-01T08:00:00Z"])).rows[0].id;
    interNew = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,$4) returning id', [artisanA, clientA, "Récente", "2026-06-10T08:00:00Z"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getInterventionOwned / getClientOwned : sous A OK ; anti-IDOR sous B → null", async () => {
    expect((await repo.getInterventionOwned(ctx(artisanA), interNew))?.id).toBe(interNew);
    expect(await repo.getInterventionOwned(ctx(artisanB), interNew)).toBeNull();
    const c = await repo.getClientOwned(ctx(artisanA), clientA);
    expect(c).toEqual({ id: clientA, nom: "Leroy", email: "leroy@cli.fr" });
    expect(await repo.getClientOwned(ctx(artisanB), clientA)).toBeNull();
  });

  it("getDerniereInterventionDuClient : renvoie la plus récente (dateDebut desc)", async () => {
    const last = await repo.getDerniereInterventionDuClient(ctx(artisanA), clientA);
    expect(last?.id).toBe(interNew);
    expect(await repo.getDerniereInterventionDuClient(ctx(artisanB), clientA)).toBeNull();
  });

  it("creerDemande : insère une demande envoyee scopée à l'artisan du contexte", async () => {
    const d = await repo.creerDemande(ctx(artisanA), {
      clientId: clientA,
      interventionId: interNew,
      tokenDemande: "tok-dmd-9960311",
      emailEnvoyeAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    expect(d.artisanId).toBe(artisanA);
    expect(d.statut).toBe("envoyee");
    expect(d.tokenDemande).toBe("tok-dmd-9960311");
    const { rows } = await admin.query('select "artisanId", statut from demandes_avis where "tokenDemande"=$1', ["tok-dmd-9960311"]);
    expect(rows).toEqual([{ artisanId: artisanA, statut: "envoyee" }]);
  });
});
