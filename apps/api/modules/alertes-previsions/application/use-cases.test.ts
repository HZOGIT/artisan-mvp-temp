import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { AlertesPrevisionsRepositoryFake } from "../infra/alertes-previsions-repository-fake";
import type { AlerteConfig } from "../domain/alerte-prevision";
import { getConfig, saveConfig, getHistorique, verifierEtEnvoyer } from "./use-cases";

const ctx: TenantContext = { artisanId: 1, userId: 1 };
const NOW = new Date("2026-06-15T12:00:00Z"); // mois 6, année 2026

const actif: AlerteConfig = {
  seuilAlertePositif: "10.00", seuilAlerteNegatif: "10.00", alerteEmail: true, alerteSms: false,
  emailDestination: "a@b.fr", telephoneDestination: null, frequenceVerification: "hebdomadaire", actif: true,
};

describe("getConfig / saveConfig", () => {
  it("getConfig renvoie null si non configuré", async () => {
    expect(await getConfig(new AlertesPrevisionsRepositoryFake(), ctx)).toBeNull();
  });
  it("saveConfig upsert puis getConfig reflète le patch", async () => {
    const repo = new AlertesPrevisionsRepositoryFake();
    await saveConfig(repo, ctx, { actif: true, seuilAlertePositif: "20.00" });
    const c = await getConfig(repo, ctx);
    expect(c?.actif).toBe(true);
    expect(c?.seuilAlertePositif).toBe("20.00");
  });
});

describe("verifierEtEnvoyer", () => {
  it("pas de config / inactif → []", async () => {
    expect(await verifierEtEnvoyer(new AlertesPrevisionsRepositoryFake(), ctx, NOW)).toEqual([]);
    expect(await verifierEtEnvoyer(new AlertesPrevisionsRepositoryFake({ config: { ...actif, actif: false } }), ctx, NOW)).toEqual([]);
  });

  it("pas de prévision ou prévision ≤ 0 → []", async () => {
    expect(await verifierEtEnvoyer(new AlertesPrevisionsRepositoryFake({ config: actif, previsionCA: null }), ctx, NOW)).toEqual([]);
    expect(await verifierEtEnvoyer(new AlertesPrevisionsRepositoryFake({ config: actif, previsionCA: 0 }), ctx, NOW)).toEqual([]);
  });

  it("écart sous les seuils → [] (pas d'alerte)", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: actif, previsionCA: 1000, caRealise: 1050 }); // +5% < 10%
    expect(await verifierEtEnvoyer(repo, ctx, NOW)).toEqual([]);
    expect(repo.historique).toHaveLength(0);
  });

  it("dépassement positif → enregistre une alerte (type/canal/message)", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: actif, previsionCA: 1000, caRealise: 1300 }); // +30%
    const res = await verifierEtEnvoyer(repo, ctx, NOW);
    expect(res).toHaveLength(1);
    expect(res[0].typeAlerte).toBe("depassement_positif");
    expect(res[0].mois).toBe(6);
    expect(res[0].annee).toBe(2026);
    expect(res[0].canalEnvoi).toBe("email");
    expect(res[0].caPrevisionnel).toBe("1000.00");
    expect(res[0].caRealise).toBe("1300.00");
    expect(res[0].message).toContain("Bonne nouvelle");
    expect(repo.historique).toHaveLength(1);
  });

  it("dépassement négatif → alerte négative", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: actif, previsionCA: 1000, caRealise: 700 }); // -30%
    const res = await verifierEtEnvoyer(repo, ctx, NOW);
    expect(res[0].typeAlerte).toBe("depassement_negatif");
    expect(res[0].message).toContain("Attention");
  });

  it("anti-spam : une alerte du même type déjà enregistrée ce mois → []", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({
      config: actif, previsionCA: 1000, caRealise: 1300,
      historique: [{ id: 9, mois: 6, annee: 2026, typeAlerte: "depassement_positif", caPrevisionnel: "1000.00", caRealise: "1200.00", ecartPourcentage: "20.00", canalEnvoi: "email", dateEnvoi: new Date("2026-06-05"), statut: "envoye", message: "x" }],
    });
    expect(await verifierEtEnvoyer(repo, ctx, NOW)).toEqual([]);
    expect(repo.historique).toHaveLength(1); // pas de nouvelle ligne
  });
});

describe("getHistorique", () => {
  it("renvoie l'historique trié, plus récent d'abord", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({
      historique: [
        { id: 1, mois: 5, annee: 2026, typeAlerte: "depassement_positif", caPrevisionnel: null, caRealise: null, ecartPourcentage: null, canalEnvoi: "email", dateEnvoi: new Date("2026-05-01"), statut: "envoye", message: null },
        { id: 2, mois: 6, annee: 2026, typeAlerte: "depassement_negatif", caPrevisionnel: null, caRealise: null, ecartPourcentage: null, canalEnvoi: "sms", dateEnvoi: new Date("2026-06-01"), statut: "envoye", message: null },
      ],
    });
    expect((await getHistorique(repo, ctx)).map((h) => h.id)).toEqual([2, 1]);
  });
});
