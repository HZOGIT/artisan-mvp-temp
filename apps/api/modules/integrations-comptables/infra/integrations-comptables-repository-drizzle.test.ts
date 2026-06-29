import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { IntegrationsComptablesRepositoryDrizzle } from "./integrations-comptables-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9954251;
const UID_B = 9954252;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : repository des intégrations comptables (config upsert, exports, factures IIF, items en
// attente), toutes tables SOUS LE TENANT. Vérifie l'upsert + whitelist de colonnes, les exports
// (création/liste/maj scopée), la sélection IIF (période + statuts hors brouillon + join client) et
// les items en attente (facture émise non couverte par un export terminé), avec anti-IDOR.
describe.skipIf(!URL)("IntegrationsComptablesRepositoryDrizzle (RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new IntegrationsComptablesRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from exports_comptables where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from configurations_comptables where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from factures where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Compta A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Compta B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [artisanA, "Durand", "Eve"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("saveConfig : upsert (insert puis update) + whitelist colonnes + getConfig round-trip + anti-IDOR", async () => {
    // insert ; clé inconnue ignorée (whitelist)
    const c1 = await repo.saveConfig(ctx(artisanA), { logiciel: "sage", compteVentes: "707", hackerCol: "DROP" } as never);
    expect(c1?.logiciel).toBe("sage");
    expect(c1?.compteVentes).toBe("707");
    expect((c1 as Record<string, unknown>).hackerCol).toBeUndefined();
    // update partiel (n'écrase pas compteVentes)
    await repo.saveConfig(ctx(artisanA), { compteClients: "411" });
    const c2 = await repo.getConfig(ctx(artisanA));
    expect(c2?.compteVentes).toBe("707");
    expect(c2?.compteClients).toBe("411");
    expect(await repo.getConfig(ctx(artisanB))).toBeNull(); // anti-IDOR
  });

  it("createExport / listExports / updateExport : scopé tenant, tri desc, maj statut", async () => {
    const e = await repo.createExport(ctx(artisanA), { logiciel: "ciel", formatExport: "fec", periodeDebut: "2026-01-01", periodeFin: "2026-01-31", nombreEcritures: 3 });
    expect(e.statut).toBe("en_cours");
    await repo.updateExport(ctx(artisanA), e.id, { statut: "termine", nombreEcritures: 5 });
    const list = await repo.listExports(ctx(artisanA));
    expect(list.find((x) => x.id === e.id)?.statut).toBe("termine");
    // anti-IDOR : B ne peut pas modifier l'export de A
    await repo.updateExport(ctx(artisanB), e.id, { statut: "erreur" });
    const after = await repo.listExports(ctx(artisanA));
    expect(after.find((x) => x.id === e.id)?.statut).toBe("termine"); // inchangé
    expect(await repo.listExports(ctx(artisanB))).toEqual([]);
  });

  it("listFacturesForIIF : période + statuts émis uniquement + join client ; anti-IDOR", async () => {
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalTTC") values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "IIF-1", "payee", "2026-02-10", "120.00"]);
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalTTC") values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "IIF-2", "brouillon", "2026-02-12", "50.00"]); // exclue
    await admin.query('insert into factures ("artisanId","clientId",numero,statut,"dateFacture","totalTTC") values ($1,$2,$3,$4,$5,$6)', [artisanA, clientA, "IIF-3", "payee", "2026-05-01", "80.00"]); // hors période
    const rows = await repo.listFacturesForIIF(ctx(artisanA), new Date("2026-02-01"), new Date("2026-02-28"));
    expect(rows.map((r) => r.numero)).toEqual(["IIF-1"]); // brouillon + hors période exclus
    expect(rows[0].clientNom).toBe("Durand");
    expect(await repo.listFacturesForIIF(ctx(artisanB), new Date("2026-02-01"), new Date("2026-02-28"))).toEqual([]);
  });

  it("saveConfig regimeTVA : persist + round-trip + isolation tenant (L2)", async () => {
    const c = await repo.saveConfig(ctx(artisanA), { regimeTVA: "debits" });
    expect(c?.regimeTVA).toBe("debits");
    const read = await repo.getConfig(ctx(artisanA));
    expect(read?.regimeTVA).toBe("debits");
    await repo.saveConfig(ctx(artisanA), { regimeTVA: "encaissements" });
    expect((await repo.getConfig(ctx(artisanA)))?.regimeTVA).toBe("encaissements");
    expect(await repo.getConfig(ctx(artisanB))).toBeNull(); // isolation B inchangé
  });

  it("getLockDate / setLockDate : persist + round-trip + isolation tenant (L2 RLS)", async () => {
    expect(await repo.getLockDate(ctx(artisanA))).toBeNull();
    await repo.setLockDate(ctx(artisanA), "2024-03-31");
    expect(await repo.getLockDate(ctx(artisanA))).toBe("2024-03-31");
    expect(await repo.getLockDate(ctx(artisanB))).toBeNull(); // isolation tenant
    await repo.setLockDate(ctx(artisanA), "2024-06-30");
    expect(await repo.getLockDate(ctx(artisanA))).toBe("2024-06-30"); // maj
    await repo.setLockDate(ctx(artisanA), null);
    expect(await repo.getLockDate(ctx(artisanA))).toBeNull(); // reset
  });

  it("listPendingItems : facture émise non couverte par un export terminé chevauchant", async () => {
    const pendingBefore = await repo.listPendingItems(ctx(artisanA));
    expect(pendingBefore.some((p) => p.numero === "IIF-1")).toBe(true); // pas encore couverte
    // export terminé couvrant février → IIF-1 (10/02) devient couverte
    await repo.createExport(ctx(artisanA), { logiciel: "ciel", formatExport: "fec", periodeDebut: "2026-02-01", periodeFin: "2026-02-28", statut: "termine" });
    const pendingAfter = await repo.listPendingItems(ctx(artisanA));
    expect(pendingAfter.some((p) => p.numero === "IIF-1")).toBe(false); // désormais couverte
    expect(pendingAfter.some((p) => p.numero === "IIF-3")).toBe(true); // mai, non couverte
  });
});
