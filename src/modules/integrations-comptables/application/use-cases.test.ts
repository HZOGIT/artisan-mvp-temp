import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { IntegrationsComptablesRepositoryFake } from "../infra/integrations-comptables-repository-fake";
import { getConfig, saveConfig, saveSyncConfig, getSyncStatus, getExports, genererExport, type GenererExportDeps } from "./use-cases";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

describe("config", () => {
  it("getConfig null si absente ; saveConfig upsert ; saveSyncConfig MAJ champs sync", async () => {
    const repo = new IntegrationsComptablesRepositoryFake();
    expect(await getConfig(repo, ctx)).toBeNull();
    await saveConfig(repo, ctx, { logiciel: "sage", formatExport: "fec", compteVentes: "707" });
    expect((await getConfig(repo, ctx))?.logiciel).toBe("sage");
    await saveSyncConfig(repo, ctx, { syncAutoFactures: true, frequenceSync: "quotidien" });
    const c = await getConfig(repo, ctx);
    expect(c?.syncAutoFactures).toBe(true);
    expect(c?.compteVentes).toBe("707"); // préservé
  });

  it("getSyncStatus dérive l'état de la config", async () => {
    const repo = new IntegrationsComptablesRepositoryFake();
    expect((await getSyncStatus(repo, ctx)).actif).toBe(false);
    await saveSyncConfig(repo, ctx, { syncAutoPaiements: true });
    expect((await getSyncStatus(repo, ctx)).actif).toBe(true);
  });
});

describe("genererExport", () => {
  function build(repo = new IntegrationsComptablesRepositoryFake({ facturesIIF: [{ id: 1, numero: "FAC-1", dateFacture: new Date("2026-03-10"), totalHT: "100", totalTVA: "20", totalTTC: "120", clientNom: "Dupont", clientPrenom: "Jean" }] })): { deps: GenererExportDeps; repo: IntegrationsComptablesRepositoryFake; fecCalls: any[] } {
    const fecCalls: any[] = [];
    return { repo, fecCalls, deps: { repo, fec: { getFecContent: async (_c, p) => { fecCalls.push(p); return "JournalCode\t...\nVE\t...\n"; } } } };
  }

  it("format FEC → réutilise le générateur compta + enregistre l'export terminé", async () => {
    const { deps, repo, fecCalls } = build();
    const res = await genererExport(deps, ctx, { logiciel: "sage", formatExport: "fec", dateDebut: "2026-01-01", dateFin: "2026-03-31" });
    expect(res.contenu).toContain("VE");
    expect(fecCalls).toHaveLength(1);
    expect(repo.exports[0].statut).toBe("termine");
    expect(res.id).toBe(repo.exports[0].id);
  });

  it("format IIF → contenu QuickBooks (sans appeler le FEC)", async () => {
    const { deps, repo, fecCalls } = build();
    const res = await genererExport(deps, ctx, { logiciel: "quickbooks", formatExport: "iif", dateDebut: "2026-01-01", dateFin: "2026-03-31" });
    expect(res.contenu).toContain("!TRNS");
    expect(res.contenu).toContain("Jean Dupont");
    expect(fecCalls).toHaveLength(0);
    expect(repo.exports[0].statut).toBe("termine");
  });

  it("format non implémenté (csv) → contenu vide, export terminé", async () => {
    const { deps, repo } = build();
    const res = await genererExport(deps, ctx, { logiciel: "autre", formatExport: "csv", dateDebut: "2026-01-01", dateFin: "2026-03-31" });
    expect(res.contenu).toBe("");
    expect(repo.exports[0].statut).toBe("termine");
  });
});

describe("getExports", () => {
  it("liste les exports (plus récents d'abord)", async () => {
    const repo = new IntegrationsComptablesRepositoryFake();
    await repo.createExport(ctx, { logiciel: "sage", formatExport: "fec", periodeDebut: "2026-01-01", periodeFin: "2026-01-31" });
    await repo.createExport(ctx, { logiciel: "sage", formatExport: "fec", periodeDebut: "2026-02-01", periodeFin: "2026-02-28" });
    expect((await getExports(repo, ctx)).map((e) => e.id)).toEqual([2, 1]);
  });
});
