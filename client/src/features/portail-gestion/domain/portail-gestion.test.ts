import { describe, expect, it } from "vitest";
import { filterClients, portalState, type PortailClient, type PortalStatus } from "./portail-gestion";

const mkC = (p: Partial<PortailClient> & { id: number }): PortailClient =>
  ({ nom: "", prenom: "", email: "", ...p } as unknown as PortailClient);
const mkS = (p: Partial<NonNullable<PortalStatus>>): PortalStatus =>
  ({ token: "tok", dateExpiration: null, lastAccessAt: null, ...p } as unknown as PortalStatus);

describe("filterClients", () => {
  const list = [
    mkC({ id: 1, nom: "Durand", prenom: "Paul", email: "paul@x.fr" }),
    mkC({ id: 2, nom: "Martin", prenom: "Léa", email: "lea@y.fr" }),
  ];
  it("recherche nom / prénom / email", () => {
    expect(filterClients(list, "durand").map((c) => c.id)).toEqual([1]);
    expect(filterClients(list, "léa").map((c) => c.id)).toEqual([2]);
    expect(filterClients(list, "y.fr").map((c) => c.id)).toEqual([2]);
  });
  it("recherche vide → tout", () => {
    expect(filterClients(list, "")).toHaveLength(2);
  });
});

describe("portalState", () => {
  const now = new Date("2026-06-17T12:00:00Z");
  it("inactif sans statut", () => {
    expect(portalState(undefined, now)).toBe("inactif");
  });
  it("actif si pas de date d'expiration ou expiration future", () => {
    expect(portalState(mkS({ dateExpiration: null }), now)).toBe("actif");
    expect(portalState(mkS({ dateExpiration: "2026-12-31" }), now)).toBe("actif");
  });
  it("expiré si date d'expiration passée", () => {
    expect(portalState(mkS({ dateExpiration: "2026-01-01" }), now)).toBe("expire");
  });
});
