import { describe, expect, it } from "vitest";
import { syncConfigFromConfig, statutVariant, pendingTotal, exportFilename, DEFAULT_SYNC_CONFIG, type Config, type PendingItems } from "./integrations-comptables";

describe("integrations-comptables — domain pur", () => {
  it("syncConfigFromConfig : hydrate + valide la fréquence, défaut si config nulle", () => {
    const cfg = { syncAutoFactures: true, syncAutoPaiements: false, frequenceSync: "hebdomadaire", heureSync: "03:30", notifierErreurs: false, notifierSucces: true } as unknown as Config;
    const s = syncConfigFromConfig(cfg);
    expect(s.syncAutoFactures).toBe(true);
    expect(s.frequenceSync).toBe("hebdomadaire");
    expect(s.heureSync).toBe("03:30");
    expect(s.notifierErreurs).toBe(false);
    // fréquence inconnue → repli quotidien
    expect(syncConfigFromConfig({ frequenceSync: "annuel" } as unknown as Config).frequenceSync).toBe("quotidien");
    expect(syncConfigFromConfig(undefined as unknown as Config)).toEqual(DEFAULT_SYNC_CONFIG);
  });

  it("statutVariant : termine/succes default, erreur destructive, sinon secondary", () => {
    expect(statutVariant("termine")).toBe("default");
    expect(statutVariant("erreur")).toBe("destructive");
    expect(statutVariant("en_attente")).toBe("secondary");
  });

  it("pendingTotal : somme factures + paiements + erreurs", () => {
    expect(pendingTotal({ facturesEnAttente: 2, paiementsEnAttente: 3, erreurs: 1, items: [] } as unknown as PendingItems)).toBe(6);
    expect(pendingTotal(undefined)).toBe(0);
  });

  it("exportFilename : logiciel + format + date ISO", () => {
    expect(exportFilename("sage", "fec", new Date("2026-06-18T10:00:00Z"))).toBe("export_sage_fec_2026-06-18.txt");
  });
});
