import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeTechnicienPositionReader } from "../infra/position-reader-fake";
import type { TechnicienAvecPosition } from "../domain/position";
import { getPositions } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

const tech = (id: number, over: Partial<TechnicienAvecPosition> = {}): TechnicienAvecPosition => ({
  id,
  nom: `Tech${id}`,
  prenom: null,
  email: null,
  telephone: null,
  specialite: null,
  couleur: "#3b82f6",
  position: null,
  ...over,
});

describe("geolocalisation use-cases", () => {
  it("getPositions : renvoie les techniciens du tenant (avec/ sans position)", async () => {
    const reader = new FakeTechnicienPositionReader();
    reader.seed(1, [
      tech(1, { position: { id: 9, technicienId: 1, latitude: "48.85", longitude: "2.35", precision: null, vitesse: null, cap: null, batterie: 80, enDeplacement: true, interventionEnCoursId: null, timestamp: new Date(0), createdAt: new Date(0) } }),
      tech(2),
    ]);
    const res = await getPositions(reader, ctx(1));
    expect(res.map((t) => t.id)).toEqual([1, 2]);
    expect(res[0].position?.batterie).toBe(80);
    expect(res[1].position).toBeNull();
  });

  it("getPositions : scopé tenant (un autre tenant a ses propres techniciens)", async () => {
    const reader = new FakeTechnicienPositionReader();
    reader.seed(1, [tech(1)]);
    reader.seed(2, [tech(5), tech(6)]);
    expect(await getPositions(reader, ctx(1))).toHaveLength(1);
    expect(await getPositions(reader, ctx(2))).toHaveLength(2);
    expect(await getPositions(reader, ctx(3))).toEqual([]);
  });
});
