import { describe, expect, it } from "vitest";
import {
  isSignatureProcessed,
  canSubmitSignature,
  buildPdfLignes,
  type SignatureLigne,
} from "./signature";

describe("isSignatureProcessed", () => {
  it("vrai pour accepte/refuse, faux sinon", () => {
    expect(isSignatureProcessed("accepte")).toBe(true);
    expect(isSignatureProcessed("refuse")).toBe(true);
    expect(isSignatureProcessed("en_attente")).toBe(false);
    expect(isSignatureProcessed(null)).toBe(false);
  });
});

describe("canSubmitSignature", () => {
  const ok = { hasSignature: true, signataireName: "Jean", signataireEmail: "j@x.fr", accepted: true, token: "tok" };
  it("vrai quand tout est rempli", () => {
    expect(canSubmitSignature(ok)).toBe(true);
  });
  it("faux si un champ manque", () => {
    expect(canSubmitSignature({ ...ok, hasSignature: false })).toBe(false);
    expect(canSubmitSignature({ ...ok, signataireName: "" })).toBe(false);
    expect(canSubmitSignature({ ...ok, signataireEmail: "" })).toBe(false);
    expect(canSubmitSignature({ ...ok, accepted: false })).toBe(false);
    expect(canSubmitSignature({ ...ok, token: undefined })).toBe(false);
  });
});

const mkL = (p: Partial<SignatureLigne>): SignatureLigne =>
  ({ designation: "", description: null, quantite: "1", unite: "u", prixUnitaireHT: "0", tauxTVA: "20", ...p } as unknown as SignatureLigne);

describe("buildPdfLignes", () => {
  it("parse les montants et applique les défauts legacy", () => {
    const out = buildPdfLignes([
      mkL({ designation: "Pose", quantite: "2", prixUnitaireHT: "150.50", tauxTVA: "10", unite: "h" }),
      mkL({ designation: "Forfait", quantite: "0", prixUnitaireHT: "abc", tauxTVA: "" }),
    ]);
    expect(out[0]).toEqual({ designation: "Pose", description: null, quantite: 2, unite: "h", prixUnitaire: 150.5, tauxTva: 10 });
    // quantite 0 → 1 (défaut), prix invalide → 0, tva vide → 20 (défaut)
    expect(out[1]).toMatchObject({ designation: "Forfait", quantite: 1, prixUnitaire: 0, tauxTva: 20 });
  });
});
