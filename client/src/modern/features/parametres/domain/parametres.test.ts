import { describe, expect, it } from "vitest";
import {
  parametresToForm, formToUpdateInput, buildIcalUrl, demandeStatutClass, FORM_DEFAULTS,
  type Parametres,
} from "./parametres";

const params = (p: Partial<Parametres>): Parametres =>
  ({ prefixeDevis: "DEV-", prefixeFacture: "FAC-", mentionsLegales: null, conditionsGenerales: null, conditionsPaiementDefaut: null, delaiPaiementJours: null, delaiPaiementType: "net", notificationsEmail: true, rappelDevisJours: 30, couleurPrincipale: "#4F46E5", couleurSecondaire: "#6366F1", ...p } as unknown as Parametres);

describe("parametresToForm", () => {
  it("mappe les champs serveur + slug, avec défauts", () => {
    const f = parametresToForm(params({ prefixeDevis: "D2-", mentionsLegales: "ML", conditionsGenerales: "CG", delaiPaiementJours: 45, delaiPaiementType: "fin_de_mois", rappelDevisJours: 60, notificationsEmail: false }), "mon-slug");
    expect(f.prefixeDevis).toBe("D2-");
    expect(f.mentionsLegalesDevis).toBe("ML");
    expect(f.mentionsLegalesFacture).toBe("CG");
    expect(f.delaiPaiementJours).toBe("45");
    expect(f.delaiPaiementType).toBe("fin_de_mois");
    expect(f.delaiValiditeDevis).toBe("60");
    expect(f.notificationsEmail).toBe(false);
    expect(f.slug).toBe("mon-slug");
  });
  it("delaiPaiementJours null → '' ; type inconnu → net ; défauts couleurs", () => {
    const f = parametresToForm(params({ delaiPaiementJours: null, delaiPaiementType: "autre", couleurPrincipale: "" }), "");
    expect(f.delaiPaiementJours).toBe("");
    expect(f.delaiPaiementType).toBe("net");
    expect(f.couleurPrincipale).toBe("#4F46E5");
    expect(f.slug).toBe("");
  });
});

describe("formToUpdateInput", () => {
  it("mappe le formulaire vers l'input update (sans champ vitrine)", () => {
    const input = formToUpdateInput({ ...FORM_DEFAULTS, mentionsLegalesDevis: "X", mentionsLegalesFacture: "Y", delaiValiditeDevis: "15" });
    expect(input.mentionsLegales).toBe("X");
    expect(input.conditionsGenerales).toBe("Y");
    expect(input.rappelDevisJours).toBe(15);
    expect("vitrineActive" in input).toBe(false);
  });
  it("delaiPaiementJours vide → null ; non-numérique validité → 30", () => {
    expect(formToUpdateInput({ ...FORM_DEFAULTS, delaiPaiementJours: "   " }).delaiPaiementJours).toBeNull();
    expect(formToUpdateInput({ ...FORM_DEFAULTS, delaiPaiementJours: "30" }).delaiPaiementJours).toBe(30);
    expect(formToUpdateInput({ ...FORM_DEFAULTS, delaiValiditeDevis: "abc" }).rappelDevisJours).toBe(30);
  });
});

describe("buildIcalUrl", () => {
  it("compose origin+path, '' si pas de path", () => {
    expect(buildIcalUrl("/api/calendar/tok.ics", "https://x.fr")).toBe("https://x.fr/api/calendar/tok.ics");
    expect(buildIcalUrl(null, "https://x.fr")).toBe("");
    expect(buildIcalUrl(undefined, "https://x.fr")).toBe("");
  });
});

describe("demandeStatutClass", () => {
  it("mappe le statut vers une classe", () => {
    expect(demandeStatutClass("converti")).toContain("green");
    expect(demandeStatutClass("perdu")).toContain("gray");
    expect(demandeStatutClass("contacte")).toContain("amber");
    expect(demandeStatutClass("nouveau")).toContain("blue");
  });
});
