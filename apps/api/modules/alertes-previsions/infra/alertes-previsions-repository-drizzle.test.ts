import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { AlertesPrevisionsRepositoryDrizzle } from "./alertes-previsions-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";
import type { InsertHistoriqueData } from "../application/alertes-previsions-repository";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9953241;
const UID_B = 9953242;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });
const histo = (over: Partial<InsertHistoriqueData> = {}): InsertHistoriqueData => ({
  mois: 3, annee: 2026, typeAlerte: "depassement_negatif", caPrevisionnel: "1000.00", caRealise: "700.00",
  ecartPourcentage: "-30.00", canalEnvoi: "email", statut: "envoye", message: "CA sous le seuil", ...over,
});

// L2 RLS : repository alertes-prévisions (config / historique / prévisions / CA réalisé), toutes
// tables SOUS LE TENANT. Vérifie l'upsert config + whitelist, l'historique (insert/list desc/existe),
// la prévision de CA, le CA réalisé (factures payées du mois), avec anti-IDOR cross-tenant.
describe.skipIf(!URL)("AlertesPrevisionsRepositoryDrizzle (RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new AlertesPrevisionsRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    for (const t of ["historique_alertes_previsions", "config_alertes_previsions", "previsions_ca", "factures", "clients"]) {
      await admin.query(`delete from ${t} where "artisanId" ${sub}`, [uids]);
    }
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Alerte A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Alerte B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "C"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("upsertConfig : insert puis update partiel + whitelist + getConfig + anti-IDOR", async () => {
    const c1 = await repo.upsertConfig(ctx(artisanA), { alerteEmail: true, emailDestination: "a@al.fr", hackerCol: "x" } as never);
    expect(c1?.alerteEmail).toBe(true);
    expect(c1?.emailDestination).toBe("a@al.fr");
    expect((c1 as Record<string, unknown>).hackerCol).toBeUndefined();
    await repo.upsertConfig(ctx(artisanA), { alerteSms: true });
    const c2 = await repo.getConfig(ctx(artisanA));
    expect(c2?.alerteEmail).toBe(true); // non écrasé
    expect(c2?.alerteSms).toBe(true);
    expect(await repo.getConfig(ctx(artisanB))).toBeNull();
  });

  it("insertHistorique / listHistorique / historiqueExiste : scopé tenant + tri desc", async () => {
    await repo.insertHistorique(ctx(artisanA), histo({ mois: 2 }));
    const recent = await repo.insertHistorique(ctx(artisanA), histo({ mois: 3 }));
    const list = await repo.listHistorique(ctx(artisanA));
    expect(list[0].id).toBe(recent.id); // tri desc dateEnvoi → le plus récent en tête
    expect(list).toHaveLength(2);
    expect(await repo.historiqueExiste(ctx(artisanA), 3, 2026, "depassement_negatif")).toBe(true);
    expect(await repo.historiqueExiste(ctx(artisanA), 12, 2026, "depassement_negatif")).toBe(false);
    expect(await repo.listHistorique(ctx(artisanB))).toEqual([]); // anti-IDOR
  });

  it("getPrevisionCA : valeur du mois/année ; absente → null", async () => {
    await admin.query('insert into previsions_ca ("artisanId",mois,annee,"caPrevisionnel") values ($1,$2,$3,$4)', [artisanA, 3, 2026, "5000.00"]);
    expect(await repo.getPrevisionCA(ctx(artisanA), 3, 2026)).toBe(5000);
    expect(await repo.getPrevisionCA(ctx(artisanA), 4, 2026)).toBeNull();
    expect(await repo.getPrevisionCA(ctx(artisanB), 3, 2026)).toBeNull(); // anti-IDOR
  });

  it("getCaRealiseMois : somme des factures PAYÉES du mois (exclut autres statuts/mois)", async () => {
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalTTC") values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "AL-1", "payee", "2026-03-05", "200.00"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalTTC") values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "AL-2", "payee", "2026-03-20", "150.00"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalTTC") values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "AL-3", "envoyee", "2026-03-21", "999.00"]); // pas payée
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalTTC") values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "AL-4", "payee", "2026-04-02", "500.00"]); // autre mois
    expect(await repo.getCaRealiseMois(ctx(artisanA), 3, 2026)).toBe(350); // 200 + 150
    expect(await repo.getCaRealiseMois(ctx(artisanB), 3, 2026)).toBe(0); // anti-IDOR
  });
});
