import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { InterventionMobileRepositoryFake } from "../infra/intervention-mobile-repository-fake";
import { getTodayInterventions, startIntervention, endIntervention, type InterventionsMobileDeps, type InterventionLite } from "./use-cases";

const NOW = new Date("2026-06-15T10:00:00Z");
const ownerCtx: TenantContext = { artisanId: 1, userId: 100 };
const techCtx: TenantContext = { artisanId: 1, userId: 200, role: "technicien" };

// Interventions « du jour » renvoyées par listJour (déjà filtrées par date dans l'impl réelle).
const JOUR: InterventionLite[] = [
  { id: 10, clientId: 5, technicienId: 7, dateDebut: NOW },
  { id: 11, clientId: 6, technicienId: 9, dateDebut: NOW },
];

function buildDeps(over: Partial<InterventionsMobileDeps> = {}): { deps: InterventionsMobileDeps; updated: Array<{ id: number; statut: string }>; mobile: InterventionMobileRepositoryFake } {
  const updated: Array<{ id: number; statut: string }> = [];
  const mobile = new InterventionMobileRepositoryFake();
  const deps: InterventionsMobileDeps = {
    interventions: {
      listJour: async () => JOUR,
      getById: async (_ctx, id) => (JOUR.some((i) => i.id === id) ? { id } : null),
      update: async (_ctx, id, input) => {
        updated.push({ id, statut: input.statut });
        return null;
      },
    },
    clients: { getById: async (_ctx, id) => ({ id, nom: `Client${id}` }) },
    techniciens: { list: async () => [{ id: 7, userId: 200 }, { id: 9, userId: 201 }] },
    mobile,
    ...over,
  };
  return { deps, updated, mobile };
}

describe("getTodayInterventions", () => {
  it("owner : voit toutes les interventions du jour, enrichies client + mobileData", async () => {
    const { deps } = buildDeps();
    const res = (await getTodayInterventions(deps, ownerCtx, NOW)) as Array<{ id: number; client: { id: number }; mobileData: unknown }>;
    expect(res.map((r) => r.id)).toEqual([10, 11]);
    expect(res[0].client.id).toBe(5);
    expect(res[0].mobileData).toBeNull();
  });

  it("technicien lié : RGPD data-min → ne voit que SES interventions assignées", async () => {
    const { deps } = buildDeps(); // userId 200 ↔ technicien id 7
    const res = (await getTodayInterventions(deps, techCtx, NOW)) as Array<{ id: number }>;
    expect(res.map((r) => r.id)).toEqual([10]); // seule l'intervention du technicien 7
  });

  it("technicien NON lié à une fiche : vue complète (behavior-preserving)", async () => {
    const { deps } = buildDeps({ techniciens: { list: async () => [{ id: 9, userId: 201 }] } });
    const res = (await getTodayInterventions(deps, techCtx, NOW)) as Array<{ id: number }>;
    expect(res.map((r) => r.id)).toEqual([10, 11]);
  });
});

describe("startIntervention", () => {
  it("crée les données mobiles (arrivée + géoloc) et passe l'intervention en_cours", async () => {
    const { deps, updated, mobile } = buildDeps();
    const res = await startIntervention(deps, ownerCtx, { interventionId: 10, latitude: 48.85, longitude: 2.35 }, NOW);
    expect(updated).toEqual([{ id: 10, statut: "en_cours" }]);
    expect(res.heureArrivee).toEqual(NOW);
    expect(res.latitude).toBe("48.85");
    expect(mobile.rows).toHaveLength(1);
  });

  it("met à jour les données mobiles existantes (pas de doublon)", async () => {
    const mobile = new InterventionMobileRepositoryFake([{ id: 1, interventionId: 10, heureArrivee: null, heureDepart: null, latitude: null, longitude: null, notesIntervention: null, signatureClient: null, signatureDate: null }]);
    const { deps } = buildDeps({ mobile });
    await startIntervention(deps, ownerCtx, { interventionId: 10 }, NOW);
    expect(mobile.rows).toHaveLength(1);
    expect(mobile.rows[0].heureArrivee).toEqual(NOW);
  });

  it("anti-IDOR : intervention hors tenant → NotFound (pas de transition)", async () => {
    const { deps, updated } = buildDeps();
    await expect(startIntervention(deps, ownerCtx, { interventionId: 999 }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(updated).toHaveLength(0);
  });
});

describe("endIntervention", () => {
  it("passe terminee + enregistre départ/notes/signature si données mobiles présentes", async () => {
    const mobile = new InterventionMobileRepositoryFake([{ id: 1, interventionId: 10, heureArrivee: NOW, heureDepart: null, latitude: null, longitude: null, notesIntervention: null, signatureClient: null, signatureDate: null }]);
    const { deps, updated } = buildDeps({ mobile });
    const res = await endIntervention(deps, ownerCtx, { interventionId: 10, notes: "RAS", signatureClient: "data:img" }, NOW);
    expect(res).toEqual({ success: true });
    expect(updated).toEqual([{ id: 10, statut: "terminee" }]);
    expect(mobile.rows[0].heureDepart).toEqual(NOW);
    expect(mobile.rows[0].notesIntervention).toBe("RAS");
    expect(mobile.rows[0].signatureClient).toBe("data:img");
    expect(mobile.rows[0].signatureDate).toEqual(NOW);
  });

  it("sans données mobiles : statut terminee quand même, pas d'erreur", async () => {
    const { deps, updated } = buildDeps();
    expect(await endIntervention(deps, ownerCtx, { interventionId: 11 }, NOW)).toEqual({ success: true });
    expect(updated).toEqual([{ id: 11, statut: "terminee" }]);
  });

  it("anti-IDOR : intervention hors tenant → NotFound", async () => {
    const { deps } = buildDeps();
    await expect(endIntervention(deps, ownerCtx, { interventionId: 999 }, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});
