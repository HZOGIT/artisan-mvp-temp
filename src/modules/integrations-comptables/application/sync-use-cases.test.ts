import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { IntegrationsComptablesRepositoryFake } from "../infra/integrations-comptables-repository-fake";
import type { ConfigComptable, PendingItem } from "../domain/integration-comptable";
import { getSyncLogs, getPendingItems, lancerSync, retrySync } from "./use-cases";

const ctx: TenantContext = { artisanId: 1, userId: 1 };
const NOW = new Date("2026-06-15T10:00:00Z");
const PENDING: PendingItem[] = [
  { id: 1, numero: "FAC-1", dateFacture: new Date("2026-06-01"), totalTTC: "120", statut: "validee" },
  { id: 2, numero: "FAC-2", dateFacture: new Date("2026-06-05"), totalTTC: "240", statut: "payee" },
];
const config = (over: Partial<ConfigComptable> = {}): ConfigComptable => ({ logiciel: "sage", formatExport: "fec", compteVentes: null, compteTVACollectee: null, compteClients: null, compteAchats: null, compteTVADeductible: null, compteFournisseurs: null, compteBanque: null, compteCaisse: null, journalVentes: null, journalAchats: null, journalBanque: null, prefixeFacture: null, prefixeAvoir: null, exerciceDebut: null, actif: true, syncAutoFactures: null, syncAutoPaiements: null, frequenceSync: null, heureSync: null, notifierErreurs: null, notifierSucces: null, derniereSync: null, prochainSync: null, ...over });

describe("getPendingItems", () => {
  it("renvoie l'OBJET attendu par le client (facturesEnAttente/items)", async () => {
    const repo = new IntegrationsComptablesRepositoryFake({ pendingItems: PENDING });
    const res = await getPendingItems(repo, ctx);
    expect(res.facturesEnAttente).toBe(2);
    expect(res.paiementsEnAttente).toBe(0);
    expect(res.erreurs).toBe(0);
    expect(res.items.map((i) => i.numero)).toEqual(["FAC-1", "FAC-2"]);
  });
});

describe("lancerSync", () => {
  it("config absente → {success:false}", async () => {
    const repo = new IntegrationsComptablesRepositoryFake({ pendingItems: PENDING });
    expect(await lancerSync(repo, ctx, NOW)).toEqual({ success: false, nbItems: 0, message: "Configuration absente" });
  });
  it("rien en attente → {success:true, nbItems:0}", async () => {
    const repo = new IntegrationsComptablesRepositoryFake({ config: config(), pendingItems: [] });
    expect(await lancerSync(repo, ctx, NOW)).toMatchObject({ success: true, nbItems: 0 });
    expect(repo.exports).toHaveLength(0);
  });
  it("items en attente → crée 1 export terminé + touch derniereSync", async () => {
    const repo = new IntegrationsComptablesRepositoryFake({ config: config(), pendingItems: PENDING });
    const res = await lancerSync(repo, ctx, NOW);
    expect(res).toMatchObject({ success: true, nbItems: 2 });
    expect(res.message).toContain("2 ecritures");
    expect(repo.exports).toHaveLength(1);
    expect(repo.exports[0].statut).toBe("termine");
    expect(repo.exports[0].nombreEcritures).toBe(2);
    expect(repo.exports[0].periodeDebut).toBe("2026-06-01"); // début du mois courant
    expect(repo.derniereSyncTouched).toEqual(NOW);
  });
});

describe("getSyncLogs / retrySync", () => {
  it("getSyncLogs liste les exports", async () => {
    const repo = new IntegrationsComptablesRepositoryFake({ config: config(), pendingItems: PENDING });
    await lancerSync(repo, ctx, NOW);
    expect(await getSyncLogs(repo, ctx)).toHaveLength(1);
  });
  it("retrySync remarque l'export → termine, erreur nulle (scopé tenant)", async () => {
    const repo = new IntegrationsComptablesRepositoryFake({ config: config() });
    const exp = await repo.createExport(ctx, { logiciel: "sage", formatExport: "fec", periodeDebut: "2026-06-01", periodeFin: "2026-06-15", statut: "erreur" });
    expect(await retrySync(repo, ctx, exp.id)).toEqual({ success: true });
    expect((await getSyncLogs(repo, ctx))[0].statut).toBe("termine");
  });
});
