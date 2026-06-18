import { describe, expect, it } from "vitest";
import {
  buildMatrixRows, roleDefaults, togglePermission, isCustomized, hasAnyCustomization, fullName,
  ROLES, INVITABLE_ROLES, type Utilisateur,
} from "./utilisateur";

const u = (p: Partial<Utilisateur>): Utilisateur =>
  ({ id: 1, name: null, prenom: null, email: null, role: "secretaire", actif: true, lastSignedIn: null, ...p } as unknown as Utilisateur);

describe("constantes rôles", () => {
  it("ROLES inclut admin, INVITABLE_ROLES non", () => {
    expect(ROLES).toContain("admin");
    expect(INVITABLE_ROLES).not.toContain("admin");
    expect(INVITABLE_ROLES).toEqual(["artisan", "secretaire", "technicien"]);
  });
});

describe("buildMatrixRows", () => {
  it("produit une ligne par permission avec un booléen par rôle", () => {
    const rows = buildMatrixRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].roles).toHaveLength(ROLES.length);
    expect(rows[0].roles.every((b) => typeof b === "boolean")).toBe(true);
    // admin (col 0) a au moins une permission
    expect(rows.some((r) => r.roles[0])).toBe(true);
  });
});

describe("roleDefaults", () => {
  it("renvoie les codes du template, vide si rôle inconnu", () => {
    expect(roleDefaults("admin").length).toBeGreaterThan(0);
    expect(roleDefaults("inconnu")).toEqual([]);
  });
});

describe("togglePermission", () => {
  it("ajoute puis retire", () => {
    expect(togglePermission(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePermission(["a", "b"], "b")).toEqual(["a"]);
  });
});

describe("isCustomized / hasAnyCustomization", () => {
  it("isCustomized = différence avec le défaut du rôle", () => {
    expect(isCustomized(["a"], ["a"], "a")).toBe(false);
    expect(isCustomized(["a"], [], "a")).toBe(true); // défaut a mais retiré
    expect(isCustomized([], ["a"], "a")).toBe(true); // ajouté hors défaut
  });
  it("hasAnyCustomization false si identique au défaut, true sinon", () => {
    const defs = roleDefaults("technicien");
    expect(hasAnyCustomization(defs, defs)).toBe(false);
    expect(hasAnyCustomization(defs, [...defs, "permission.bidon.inexistante"])).toBe(false); // code hors PERMISSION_GROUPS ignoré
    expect(hasAnyCustomization(defs, [])).toBe(defs.length > 0);
  });
});

describe("fullName", () => {
  it("Prénom Nom, Nom seul, ou vide", () => {
    expect(fullName(u({ prenom: "Jean", name: "Dupont" }))).toBe("Jean Dupont");
    expect(fullName(u({ prenom: null, name: "Dupont" }))).toBe("Dupont");
    expect(fullName(u({ prenom: null, name: null }))).toBe("");
  });
});
