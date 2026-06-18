import { describe, expect, it } from "vitest";
import {
  toTechnicienStatut,
  habilExpiry,
  habilitationBadge,
  STATUT_KEYS,
  type Habilitation,
} from "./technicien";

const mkH = (dateExpiration: string | null): Pick<Habilitation, "dateExpiration"> =>
  ({ dateExpiration } as unknown as Pick<Habilitation, "dateExpiration">);

describe("toTechnicienStatut", () => {
  it("garde un statut valide, sinon actif", () => {
    expect(STATUT_KEYS).toContain("conge");
    expect(toTechnicienStatut("inactif")).toBe("inactif");
    expect(toTechnicienStatut("zzz")).toBe("actif");
    expect(toTechnicienStatut(null)).toBe("actif");
  });
});

describe("habilExpiry", () => {
  it("renvoie la date si valide, null sinon", () => {
    expect(habilExpiry(mkH("2027-01-01"))?.getFullYear()).toBe(2027);
    expect(habilExpiry(mkH(null))).toBeNull();
    expect(habilExpiry(mkH("pas-une-date"))).toBeNull();
  });
});

describe("habilitationBadge", () => {
  const now = new Date("2026-06-17T00:00:00Z");
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

  it("pas d'expiration → outline", () => {
    expect(habilitationBadge(mkH(null), now)).toEqual({ key: "habilNoExpiry", variant: "outline" });
  });
  it("expirée (< 0j) → destructive", () => {
    expect(habilitationBadge(mkH(inDays(-1)), now)).toEqual({ key: "habilExpired", variant: "destructive" });
  });
  it("expire bientôt (<= 60j) → secondary avec n jours", () => {
    const b = habilitationBadge(mkH(inDays(30)), now);
    expect(b.variant).toBe("secondary");
    expect(b.key).toBe("habilExpiresIn");
    if (b.key === "habilExpiresIn") expect(b.params.n).toBe(30);
  });
  it("valide (> 60j) → default", () => {
    expect(habilitationBadge(mkH(inDays(120)), now)).toEqual({ key: "habilValid", variant: "default" });
  });
});
