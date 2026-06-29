import { describe, it, expect } from "vitest";
import { FakeInterventionRepository } from "../infra/intervention-repository-fake";
import { getSuggestionsTechniciens, haversineKm } from "./suggestions-techniciens";
import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "../../techniciens/application/technicien-repository";
import type { Technicien } from "../../techniciens/domain/technicien";
import type { Position } from "../../techniciens/domain/position";

const A: TenantContext = { artisanId: 1, userId: 10 };
const DATE = new Date("2026-09-02T14:00:00Z");

const tech = (over: Partial<Technicien>): Technicien =>
  ({ id: 1, artisanId: 1, nom: "Martin", prenom: "Léa", email: null, telephone: null, specialite: "Plomberie", couleur: "#3B82F6", statut: "actif", coutHoraire: null, userId: null, notes: null, createdAt: new Date(), updatedAt: new Date(), ...over } as Technicien);

const pos = (lat: string, lon: string): Position =>
  ({ id: 1, technicienId: 1, latitude: lat, longitude: lon, precision: null, vitesse: null, cap: null, batterie: null, enDeplacement: false, interventionEnCoursId: null, timestamp: new Date() } as Position);

/** Repo techniciens factice : liste + batch-position scriptés par technicienId. */
function techRepo(techs: Technicien[], positions: Record<number, Position | null>, spy?: { batchCalls: number }): ITechnicienRepository {
  return {
    list: async () => techs,
    getDernierePositionBatch: async (_ctx: TenantContext, ids: number[]) => {
      if (spy) spy.batchCalls++;
      const map = new Map<number, Position>();
      for (const id of ids) {
        const p = positions[id];
        if (p) map.set(id, p);
      }
      return map;
    },
  } as unknown as ITechnicienRepository;
}

describe("haversineKm", () => {
  it("distance Paris↔Lyon ≈ 390 km (great-circle)", () => {
    const d = haversineKm(48.8566, 2.3522, 45.764, 4.8357);
    expect(d).toBeGreaterThan(385);
    expect(d).toBeLessThan(395);
  });

  it("même point → 0 km", () => {
    expect(haversineKm(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });
});

describe("getSuggestionsTechniciens", () => {
  it("trie par score (proche+dispo d'abord), calcule distance/tempsTrajet, ne renvoie que les actifs", async () => {
    const repo = new FakeInterventionRepository();
    const techs = [
      tech({ id: 1, nom: "Proche", prenom: null, statut: "actif" }),
      tech({ id: 2, nom: "Loin", prenom: null, statut: "actif" }),
      tech({ id: 3, nom: "Inactif", prenom: null, statut: "inactif" }),
    ];
    // cible à Paris ; tech1 à Paris (proche), tech2 à Lyon (loin), tech3 inactif (exclu)
    const positions = { 1: pos("48.8566", "2.3522"), 2: pos("45.7640", "4.8357"), 3: pos("48.85", "2.35") };
    const out = await getSuggestionsTechniciens(repo, techRepo(techs, positions), A, { latitude: 48.8566, longitude: 2.3522, dateIntervention: DATE });

    expect(out.map((s) => s.technicien.nom)).toEqual(["Proche", "Loin"]); // inactif exclu, proche premier
    expect(out[0].distance).toBe(0);
    expect(out[0].disponible).toBe(true);
    expect(out[0].position).toEqual({ latitude: "48.8566", longitude: "2.3522" });
    expect(out[1].distance).toBeGreaterThan(300);
  });

  it("technicien occupé (autre intervention ±2h le même jour) → disponible=false, score pénalisé", async () => {
    const repo = new FakeInterventionRepository();
    // intervention existante du tech 1 à 14h (même jour) → occupé pour une cible à 14h
    await repo.create(A, { clientId: 100, titre: "Déjà", dateDebut: new Date("2026-09-02T14:30:00Z"), technicienId: 1 });
    const out = await getSuggestionsTechniciens(
      repo,
      techRepo([tech({ id: 1, statut: "actif" })], { 1: pos("48.8566", "2.3522") }),
      A,
      { latitude: 48.8566, longitude: 2.3522, dateIntervention: DATE },
    );
    expect(out[0].disponible).toBe(false);
  });

  it("aucun technicien actif → []", async () => {
    const repo = new FakeInterventionRepository();
    const out = await getSuggestionsTechniciens(repo, techRepo([tech({ statut: "inactif" })], {}), A, { latitude: 0, longitude: 0, dateIntervention: DATE });
    expect(out).toEqual([]);
  });

  it("N techniciens → 1 seul appel getDernierePositionBatch (pas N)", async () => {
    const spy = { batchCalls: 0 };
    const repo = new FakeInterventionRepository();
    const techs = [
      tech({ id: 1, statut: "actif" }),
      tech({ id: 2, statut: "actif" }),
      tech({ id: 3, statut: "actif" }),
    ];
    const positions = { 1: pos("48.85", "2.35"), 2: pos("45.76", "4.83"), 3: null };
    await getSuggestionsTechniciens(repo, techRepo(techs, positions, spy), A, { latitude: 48.8566, longitude: 2.3522, dateIntervention: DATE });
    expect(spy.batchCalls).toBe(1);
  });
});
