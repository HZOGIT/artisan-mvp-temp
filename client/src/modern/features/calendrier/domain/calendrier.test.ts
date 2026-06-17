import { describe, expect, it } from "vitest";
import {
  resolveClient, toCalendarItems, defaultHeureFin, heureDeDate, combineDateTime,
  type Intervention, type InterventionClient, type EquipeByArtisanRow,
} from "./calendrier";

const client = (p: Partial<InterventionClient> & { id: number }): InterventionClient =>
  ({ nom: "Nom", prenom: "Prenom", adresse: null, codePostal: null, ville: null, ...p } as unknown as InterventionClient);
const inter = (p: Partial<Intervention> & { id: number; clientId: number }): Intervention =>
  ({ titre: "I", dateDebut: "2026-06-10T08:00:00Z", dateFin: null, statut: "planifiee", adresse: null, ...p } as unknown as Intervention);
const membre = (interventionId: number, technicienId: number): EquipeByArtisanRow =>
  ({ interventionId, technicienId, nom: "T", prenom: "P" } as unknown as EquipeByArtisanRow);

describe("resolveClient", () => {
  const clients = [client({ id: 1, nom: "Dupont", prenom: "Jean" })];
  it("résout {nom, prenom} via clientId", () => {
    expect(resolveClient(clients, 1)).toEqual({ nom: "Dupont", prenom: "Jean" });
  });
  it("null si introuvable", () => {
    expect(resolveClient(clients, 99)).toBeNull();
  });
});

describe("toCalendarItems", () => {
  it("projette interventions + client résolu + équipe indexée", () => {
    const interventions = [inter({ id: 10, clientId: 1, titre: "Pose" })];
    const clients = [client({ id: 1, nom: "Martin", prenom: "Eve" })];
    const map = new Map<number, EquipeByArtisanRow[]>([[10, [membre(10, 5)]]]);
    const items = toCalendarItems(interventions, clients, map);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 10, titre: "Pose", statut: "planifiee" });
    expect(items[0].client).toEqual({ nom: "Martin", prenom: "Eve" });
    expect(items[0].equipe).toHaveLength(1);
  });
  it("client null + équipe undefined si non résolus", () => {
    const items = toCalendarItems([inter({ id: 1, clientId: 999 })], [], new Map());
    expect(items[0].client).toBeNull();
    expect(items[0].equipe).toBeUndefined();
  });
});

describe("helpers de date", () => {
  it("defaultHeureFin = heure+1 borné à 20:00", () => {
    expect(defaultHeureFin(new Date(2026, 5, 10, 9, 0))).toBe("10:00");
    expect(defaultHeureFin(new Date(2026, 5, 10, 19, 30))).toBe("20:00");
    expect(defaultHeureFin(new Date(2026, 5, 10, 22, 0))).toBe("20:00");
  });
  it("heureDeDate formate HH:mm avec padStart", () => {
    expect(heureDeDate(new Date(2026, 5, 10, 8, 5))).toBe("08:05");
  });
  it("combineDateTime construit une Date locale, null si date vide", () => {
    const d = combineDateTime("2026-06-10", "08:30");
    expect(d?.getFullYear()).toBe(2026);
    expect(combineDateTime("", "08:30")).toBeNull();
  });
});
