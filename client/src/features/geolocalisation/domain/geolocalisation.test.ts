import { describe, expect, it } from "vitest";
import { withPosition, techId, latLng, batterieColor, markerIconHtml, popupContentHtml, type Tech, type TechWithPos, type PopupLabels } from "./geolocalisation";

const labels: PopupLabels = { maj: "MAJ", batterie: "Bat", vitesse: "Vit", enDeplacement: "En déplacement", stationnaire: "Stationnaire" };
const pos = (over: Record<string, unknown> = {}) => ({ technicienId: 7, latitude: "48.8566", longitude: "2.3522", timestamp: new Date(0), enDeplacement: true, batterie: 80, vitesse: "30", ...over });
const tech = (position: unknown): Tech => ({ nom: "Dupont", prenom: "Jean", specialite: "Plomberie", couleur: "#3b82f6", position } as unknown as Tech);

describe("geolocalisation — domain pur", () => {
  it("withPosition : ne garde que les techniciens positionnés + techId/latLng", () => {
    const list = [tech(pos()), tech(null)];
    const positioned = withPosition(list);
    expect(positioned).toHaveLength(1);
    expect(techId(positioned[0] as TechWithPos)).toBe(7);
    expect(latLng(positioned[0].position)).toEqual([48.8566, 2.3522]);
  });

  it("batterieColor : seuils 50/20", () => {
    expect(batterieColor(80)).toContain("green");
    expect(batterieColor(30)).toContain("yellow");
    expect(batterieColor(10)).toContain("red");
    expect(batterieColor(null)).toContain("gray");
  });

  it("markerIconHtml : couleur injectée + point vert si en déplacement", () => {
    expect(markerIconHtml("#abc", true)).toContain("#abc");
    expect(markerIconHtml("#abc", true)).toContain("#22c55e");
    expect(markerIconHtml("#abc", false)).not.toContain("#22c55e");
  });

  it("popupContentHtml : nom complet, batterie/vitesse conditionnels, statut", () => {
    const tw = withPosition([tech(pos())])[0];
    const html = popupContentHtml(tw, "08:30", labels);
    expect(html).toContain("Dupont Jean");
    expect(html).toContain("Bat: 80%");
    expect(html).toContain("30 km/h");
    expect(html).toContain("En déplacement");
    const stationnaire = popupContentHtml(withPosition([tech(pos({ enDeplacement: false, vitesse: null, batterie: null }))])[0], "08:30", labels);
    expect(stationnaire).toContain("Stationnaire");
    expect(stationnaire).not.toContain("km/h");
  });
});
