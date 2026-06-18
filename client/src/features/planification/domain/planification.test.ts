import { describe, expect, it } from "vitest";
import { interventionsNonAssignees, conflictCounts, destMarkerHtml, techMarkerHtml, techPopupHtml, type Intervention, type Suggestion, type AssignResult } from "./planification";

const inter = (id: number, technicienId: number | null, statut: string): Intervention =>
  ({ id, technicienId, statut, titre: `I${id}`, dateDebut: new Date(0) } as unknown as Intervention);
const sugg = (over: Record<string, unknown> = {}): Suggestion =>
  ({ technicien: { id: 1, nom: "Léa", couleur: "#abc", specialite: "Élec" }, distance: 5, tempsTrajet: 12, disponible: true, position: { latitude: "48.8", longitude: "2.3" }, score: 90, ...over } as unknown as Suggestion);

describe("planification — domain pur", () => {
  it("interventionsNonAssignees : sans technicien + statut planifiee", () => {
    const list = [inter(1, null, "planifiee"), inter(2, 5, "planifiee"), inter(3, null, "terminee")];
    expect(interventionsNonAssignees(list).map((i) => i.id)).toEqual([1]);
  });

  it("conflictCounts : compte interventions + congés", () => {
    expect(conflictCounts({ conflits: { interventions: [{}, {}], conges: [{}] } } as unknown as AssignResult)).toEqual({ nbInter: 2, nbConge: 1 });
    expect(conflictCounts({ conflits: null } as unknown as AssignResult)).toEqual({ nbInter: 0, nbConge: 0 });
  });

  it("destMarkerHtml / techMarkerHtml : bordure verte si dispo, rouge sinon", () => {
    expect(destMarkerHtml()).toContain("#ef4444");
    expect(techMarkerHtml("#abc", true)).toContain("#22c55e");
    expect(techMarkerHtml("#abc", false)).toContain("#ef4444");
    expect(techMarkerHtml("#abc", true)).toContain("#abc");
  });

  it("techPopupHtml : nom + spécialité + distance/temps avec unités injectées", () => {
    const html = techPopupHtml(sugg(), { km: "km", min: "min" });
    expect(html).toContain("Léa");
    expect(html).toContain("Élec");
    expect(html).toContain("5 km");
    expect(html).toContain("12 min");
  });
});
