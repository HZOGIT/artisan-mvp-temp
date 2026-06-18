import { describe, expect, it } from "vitest";
import { eur, initials, technicienName, buildRanking, splitPodium, objectifPct, enrichBadgesTechnicien, PERIODES, type ClassementEntry, type Technicien, type BadgeTechnicien, type Badge } from "./classement";

const tech = (id: number, prenom: string | null, nom: string): Technicien => ({ id, prenom, nom } as unknown as Technicien);
const entry = (id: number, technicienId: number, pointsTotal: number, rang: number): ClassementEntry =>
  ({ id, technicienId, pointsTotal, rang } as unknown as ClassementEntry);

describe("classement — domain pur", () => {
  it("eur : entiers, tolérant string/null", () => {
    expect(eur(1500)).toContain("1");
    expect(eur("2000.5")).toContain("2");
    expect(eur(null)).toContain("0");
  });

  it("initials : 2 premières lettres maj, repli ?", () => {
    expect(initials(tech(1, "Marc", "Dubois"))).toBe("MD");
    expect(initials(tech(1, null, "Xy"))).toBe("X");
    expect(initials(undefined)).toBe("?");
  });

  it("technicienName : nom complet, repli Tech #id", () => {
    expect(technicienName(tech(1, "Marc", "Dubois"), 1)).toBe("Marc Dubois");
    expect(technicienName(undefined, 9)).toBe("Tech #9");
  });

  it("buildRanking : jointure technicien par id", () => {
    const r = buildRanking([entry(10, 2, 50, 1)], [tech(2, "A", "B")]);
    expect(r[0].technicien?.nom).toBe("B");
    expect(buildRanking([entry(10, 99, 50, 1)], [])[0].technicien).toBeUndefined();
  });

  it("splitPodium : top3 + reste", () => {
    const rows = buildRanking([entry(1, 1, 9, 1), entry(2, 2, 8, 2), entry(3, 3, 7, 3), entry(4, 4, 6, 4)], []);
    const { top3, rest } = splitPodium(rows);
    expect(top3).toHaveLength(3);
    expect(rest.map((r) => r.id)).toEqual([4]);
  });

  it("objectifPct : ratio borné, 0 si cible nulle", () => {
    expect(objectifPct(6, 10)).toBe(60);
    expect(objectifPct(20, 10)).toBe(100);
    expect(objectifPct(5, 0)).toBe(0);
  });

  it("PERIODES : 4 périodes", () => {
    expect(PERIODES).toEqual(["semaine", "mois", "trimestre", "annee"]);
  });

  it("enrichBadgesTechnicien : jointure badgeId → nom/couleur/points (comble le DTO maigre du new-stack)", () => {
    const links = [{ id: 1, badgeId: 7, dateObtention: new Date("2026-01-01") }] as unknown as BadgeTechnicien[];
    const badges = [{ id: 7, nom: "Expert", couleur: "#FFD700", points: 50 }] as unknown as Badge[];
    const [b] = enrichBadgesTechnicien(links, badges);
    expect(b).toMatchObject({ id: 1, nom: "Expert", couleur: "#FFD700", points: 50 });
    // badge introuvable → champs neutres (pas de crash)
    expect(enrichBadgesTechnicien(links, [])[0]).toMatchObject({ nom: "", couleur: null, points: null });
  });
});
