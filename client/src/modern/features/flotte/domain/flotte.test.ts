import { describe, expect, it } from "vitest";
import {
  daysUntil,
  entretiensEnRetard,
  assurances30j,
  indexByVehiculeId,
  indexVehiculesById,
  type EntretienAVenir,
  type AssuranceExpirant,
  type Vehicule,
} from "./flotte";

const NOW = new Date("2026-06-17T00:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

const mkE = (p: Partial<EntretienAVenir> & { id: number; vehiculeId: number }): EntretienAVenir =>
  ({ prochainEntretienDate: null, type: "revision", ...p } as unknown as EntretienAVenir);
const mkA = (p: Partial<AssuranceExpirant> & { id: number; vehiculeId: number }): AssuranceExpirant =>
  ({ dateFin: null, compagnie: "X", ...p } as unknown as AssuranceExpirant);
const mkV = (p: Partial<Vehicule> & { id: number }): Vehicule =>
  ({ marque: "", modele: "", immatriculation: "", statut: "actif", kilometrageActuel: 0, ...p } as unknown as Vehicule);

describe("daysUntil", () => {
  it("jours restants (négatif si passé, null si absent)", () => {
    expect(daysUntil(inDays(5), NOW)).toBe(5);
    expect(daysUntil(inDays(-3), NOW)).toBe(-3);
    expect(daysUntil(null, NOW)).toBeNull();
  });
});

describe("entretiensEnRetard", () => {
  it("ne garde que les dates passées", () => {
    const list = [mkE({ id: 1, vehiculeId: 1, prochainEntretienDate: inDays(-2) }), mkE({ id: 2, vehiculeId: 2, prochainEntretienDate: inDays(10) }), mkE({ id: 3, vehiculeId: 3, prochainEntretienDate: null })];
    expect(entretiensEnRetard(list, NOW).map((e) => e.id)).toEqual([1]);
  });
});

describe("assurances30j", () => {
  it("garde les assurances expirant sous 30j (incl. expirées)", () => {
    const list = [mkA({ id: 1, vehiculeId: 1, dateFin: inDays(10) }), mkA({ id: 2, vehiculeId: 2, dateFin: inDays(40) }), mkA({ id: 3, vehiculeId: 3, dateFin: inDays(-5) })];
    expect(assurances30j(list, NOW).map((a) => a.id)).toEqual([1, 3]);
  });
});

describe("indexByVehiculeId", () => {
  it("garde la première occurrence par vehiculeId", () => {
    const map = indexByVehiculeId([mkE({ id: 1, vehiculeId: 7 }), mkE({ id: 2, vehiculeId: 7 })]);
    expect(map.get(7)?.id).toBe(1);
    expect(map.get(99)).toBeUndefined();
  });
});

describe("indexVehiculesById", () => {
  it("indexe par id", () => {
    const map = indexVehiculesById([mkV({ id: 3, marque: "Renault" })]);
    expect(map.get(3)?.marque).toBe("Renault");
  });
});
