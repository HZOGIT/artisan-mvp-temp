import { describe, expect, it } from "vitest";
import { formFromArtisan, buildUpdatePayload, passwordStrength, validateEmailChange, validatePasswordChange, defaultProfilForm, type Artisan } from "./profil";

describe("profil — domain pur", () => {
  it("formFromArtisan : mappe + specialite hors-enum → plomberie", () => {
    const a = { nomEntreprise: "ACME", specialite: "exotique", iban: "FR76", capitalSocial: 5000, formeJuridique: "SARL" } as unknown as Artisan;
    const f = formFromArtisan(a);
    expect(f.nomEntreprise).toBe("ACME");
    expect(f.specialite).toBe("plomberie"); // hors-enum → défaut
    expect(f.iban).toBe("FR76");
    expect(f.capitalSocial).toBe("5000"); // number → string
    expect(f.formeJuridique).toBe("SARL");
  });

  it("buildUpdatePayload : champs légaux vides → undefined", () => {
    const form = { ...defaultProfilForm(), nomEntreprise: "X", formeJuridique: "" as const, capitalSocial: "", villeRCS: "", numeroRM: "" };
    const p = buildUpdatePayload(form);
    expect(p.nomEntreprise).toBe("X");
    expect(p.formeJuridique).toBeUndefined();
    expect(p.capitalSocial).toBeUndefined();
    expect(p.numeroRM).toBeUndefined();
  });

  it("passwordStrength : longueur → label/pct", () => {
    expect(passwordStrength("")).toMatchObject({ labelKey: "", pct: 0 });
    expect(passwordStrength("abc")).toMatchObject({ labelKey: "pwFaible", pct: 30 });
    expect(passwordStrength("abcdefg")).toMatchObject({ labelKey: "pwMoyen", pct: 60 });
    expect(passwordStrength("abcdefghij")).toMatchObject({ labelKey: "pwFort", pct: 100 });
  });

  it("validateEmailChange", () => {
    expect(validateEmailChange("a@b.fr", "x@y.fr", "")).toBe("errEmailMismatch");
    expect(validateEmailChange("a@b.fr", "a@b.fr", "a@b.fr")).toBe("errEmailSame");
    expect(validateEmailChange("a@b.fr", "a@b.fr", "old@z.fr")).toBeNull();
  });

  it("validatePasswordChange", () => {
    expect(validatePasswordChange("old", "123", "123")).toBe("errPwTooShort");
    expect(validatePasswordChange("old", "123456", "999999")).toBe("errPwMismatch");
    expect(validatePasswordChange("samepass", "samepass", "samepass")).toBe("errPwSame");
    expect(validatePasswordChange("old", "newpass", "newpass")).toBeNull();
  });
});
