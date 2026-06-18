import { describe, expect, it } from "vitest";
import { transformInterventions, filterInterventions, interventionColor, interventionsForDay, daysInMonth, daysInWeek, rescheduledDate, statutVariant, conflictCounts, buildCsv, COLORS, type CalendarIntervention, type InterventionRow, type Chantier, type Technicien, type InterventionChantierLien, type AssignResult } from "./calendrier-chantiers";

const ci = (over: Partial<CalendarIntervention> = {}): CalendarIntervention => ({ id: 1, chantierId: 2, chantierNom: "C", technicienId: 3, technicienNom: "T", dateDebut: "2026-06-15T08:00:00Z", dateFin: null, statut: "planifiee", description: "Desc", adresse: "1 rue", ...over });

describe("calendrier-chantiers — domain pur", () => {
  it("transformInterventions : joint chantier (via lien) + technicien", () => {
    const rows = [{ id: 10, technicienId: 5, dateDebut: new Date("2026-06-15"), dateFin: null, statut: "en_cours", description: "X", adresse: null }] as unknown as InterventionRow[];
    const chantiers = [{ id: 7, nom: "Chantier A", adresse: "2 rue" }] as unknown as Chantier[];
    const techs = [{ id: 5, prenom: "Léa", nom: "M" }] as unknown as Technicien[];
    const liens = [{ interventionId: 10, chantierId: 7 }] as unknown as InterventionChantierLien[];
    const [out] = transformInterventions(rows, chantiers, techs, liens);
    expect(out.chantierNom).toBe("Chantier A");
    expect(out.technicienNom).toBe("Léa M");
    expect(out.adresse).toBe("2 rue");
  });

  it("filterInterventions : par chantier/technicien", () => {
    const list = [ci({ id: 1, chantierId: 2, technicienId: 3 }), ci({ id: 2, chantierId: 9, technicienId: 3 })];
    expect(filterInterventions(list, 2, null).map((i) => i.id)).toEqual([1]);
    expect(filterInterventions(list, null, 3)).toHaveLength(2);
  });

  it("interventionColor : custom > mode", () => {
    expect(interventionColor(ci({ id: 1 }), { 1: "bg-pink-500" }, "chantier")).toBe("bg-pink-500");
    expect(interventionColor(ci({ statut: "terminee" }), {}, "statut")).toBe("bg-green-500");
    expect(interventionColor(ci({ chantierId: 2 }), {}, "chantier")).toBe(COLORS[2 % COLORS.length].class);
  });

  it("interventionsForDay : chevauchement [début,fin]", () => {
    const list = [ci({ dateDebut: "2026-06-15T00:00:00Z", dateFin: "2026-06-17T00:00:00Z" })];
    expect(interventionsForDay(list, new Date("2026-06-16T12:00:00Z"))).toHaveLength(1);
    expect(interventionsForDay(list, new Date("2026-06-18T12:00:00Z"))).toHaveLength(0);
  });

  it("daysInMonth : 42 cases ; daysInWeek : 7 jours lundi→dimanche", () => {
    expect(daysInMonth(new Date("2026-06-15"))).toHaveLength(42);
    const wk = daysInWeek(new Date("2026-06-17")); // mercredi
    expect(wk).toHaveLength(7);
    expect(wk[0].getDay()).toBe(1); // lundi
  });

  it("rescheduledDate : décalage en jours, null si même jour", () => {
    expect(rescheduledDate("2026-06-15T08:00:00Z", new Date("2026-06-15T20:00:00Z"))).toBeNull();
    const next = rescheduledDate("2026-06-15T08:00:00Z", new Date("2026-06-18T08:00:00Z"));
    expect(next?.getDate()).toBe(18);
  });

  it("statutVariant / conflictCounts / buildCsv", () => {
    expect(statutVariant("annulee")).toBe("destructive");
    expect(conflictCounts({ conflits: { interventions: [{}], conges: [] } } as unknown as AssignResult)).toEqual({ nbInter: 1, nbConge: 0 });
    const csv = buildCsv([ci({ chantierNom: "C", description: "D", technicienNom: "T" })]);
    expect(csv.split("\n")[0]).toContain("Titre;Date début");
    expect(csv).toContain("C - D");
  });
});
