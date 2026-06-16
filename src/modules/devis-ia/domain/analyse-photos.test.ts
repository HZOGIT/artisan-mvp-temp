import { describe, it, expect } from "vitest";
import { buildImageBlocks, buildSystemPrompt, parseAnalyseResponse, sanitizeVisionError, matchBibliotheque } from "./analyse-photos";

describe("buildImageBlocks", () => {
  it("data:URL → bloc inline base64 (mimeType + base64)", () => {
    expect(buildImageBlocks(["data:image/png;base64,AAAA"])).toEqual([{ mimeType: "image/png", base64: "AAAA" }]);
  });
  it("URL http(s) → fileData (fileUri, mimeType jpeg par défaut)", () => {
    expect(buildImageBlocks(["https://x/y.jpg"])).toEqual([{ mimeType: "image/jpeg", fileUri: "https://x/y.jpg" }]);
  });
});

describe("buildSystemPrompt", () => {
  it("métier connu → prompt spécialisé (plombier ⇒ marques)", () => {
    const p = buildSystemPrompt("plombier");
    expect(p).toContain("Grohe");
    expect(p).toContain('"travaux"'); // spécification JSON présente
  });
  it("métier inconnu / null → prompt générique", () => {
    expect(buildSystemPrompt("astronaute")).toContain("Analyse les photos fournies et identifie les travaux necessaires.");
    expect(buildSystemPrompt(null)).toContain("Analyse les photos fournies et identifie les travaux necessaires.");
  });
  it("insensible à la casse du métier", () => {
    expect(buildSystemPrompt("PLOMBIER")).toContain("Grohe");
  });
});

describe("parseAnalyseResponse", () => {
  it("JSON brut avec travaux → tableau", () => {
    expect(parseAnalyseResponse('{"travaux":[{"type":"plomberie"}]}')).toHaveLength(1);
  });
  it("wrap markdown ```json … ``` → parsé", () => {
    expect(parseAnalyseResponse('```json\n{"travaux":[]}\n```')).toEqual([]);
  });
  it("texte autour du JSON → extrait le 1er objet", () => {
    expect(parseAnalyseResponse('voici le resultat: {"travaux":[{"type":"x"}]} fin')).toHaveLength(1);
  });
  it("pas de JSON → null ; JSON invalide → null ; sans tableau travaux → null", () => {
    expect(parseAnalyseResponse("aucun json ici")).toBeNull();
    expect(parseAnalyseResponse('{travaux: invalide}')).toBeNull();
    expect(parseAnalyseResponse('{"autre":1}')).toBeNull();
  });
});

describe("sanitizeVisionError", () => {
  it("masque l'image base64 et tronque", () => {
    expect(sanitizeVisionError(new Error("boom data:image/png;base64,AAAABBBB fin"))).toContain("[image]");
    expect(sanitizeVisionError(new Error("x".repeat(300))).endsWith("…")).toBe(true);
  });
  it("fallback « Erreur inconnue » sur null", () => {
    expect(sanitizeVisionError(null)).toBe("Erreur inconnue");
  });
});

describe("matchBibliotheque", () => {
  const cat = [{ id: 1, nom: "Mitigeur cuisine" }, { id: 2, nom: "Carrelage 30x30" }];
  it("inclusion bidirectionnelle → id de l'article", () => {
    expect(matchBibliotheque(cat, "mitigeur")).toBe(1); // nom catalogue inclut le nom IA
    expect(matchBibliotheque(cat, "Mitigeur cuisine inox")).toBe(1); // nom IA inclut le nom catalogue
  });
  it("aucune correspondance / nom vide → null", () => {
    expect(matchBibliotheque(cat, "peinture")).toBeNull();
    expect(matchBibliotheque(cat, undefined)).toBeNull();
  });
});
