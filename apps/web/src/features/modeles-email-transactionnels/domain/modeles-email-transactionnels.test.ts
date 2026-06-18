import { describe, expect, it } from "vitest";
import { varCode, defautToCreateInput, TYPE_OPTIONS, VARIABLES_DISPONIBLES, MODELES_PAR_DEFAUT } from "./modeles-email-transactionnels";

describe("modeles-email-transactionnels — domain pur", () => {
  it("varCode : entoure le nom d'accolades", () => {
    expect(varCode("nomClient")).toBe("{{nomClient}}");
  });

  it("TYPE_OPTIONS : valeurs d'enum VALIDES (correctif du bug legacy hors-enum)", () => {
    expect(TYPE_OPTIONS).toEqual(["relance_devis", "envoi_facture", "rappel_paiement", "autre"]);
  });

  it("VARIABLES_DISPONIBLES : 9 variables, noms sans accolades", () => {
    expect(VARIABLES_DISPONIBLES).toHaveLength(9);
    expect(VARIABLES_DISPONIBLES.every((v) => !v.includes("{"))).toBe(true);
  });

  it("MODELES_PAR_DEFAUT : 3 modèles, types valides", () => {
    expect(MODELES_PAR_DEFAUT).toHaveLength(3);
    expect(MODELES_PAR_DEFAUT.every((d) => TYPE_OPTIONS.includes(d.type))).toBe(true);
  });

  it("defautToCreateInput : injecte le nom résolu + conserve type/sujet/contenu", () => {
    const d = MODELES_PAR_DEFAUT[0];
    const input = defautToCreateInput(d, "Relance Devis");
    expect(input).toEqual({ nom: "Relance Devis", type: d.type, sujet: d.sujet, contenu: d.contenu });
  });
});
