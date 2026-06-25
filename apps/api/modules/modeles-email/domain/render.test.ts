import { describe, it, expect } from "vitest";
import { renderTemplate, renderSubject, buildModeleEmail } from "./render";

describe("renderTemplate (corps HTML)", () => {
  it("remplace {{cle}} par la valeur échappée", () => {
    expect(renderTemplate("Bonjour {{client_nom}}", { client_nom: "Marie Durand" })).toBe("Bonjour Marie Durand");
  });

  it("échappe les valeurs HTML — anti-injection XSS", () => {
    const result = renderTemplate("{{val}}", { val: '<script>alert("xss")</script>' });
    expect(result).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(result).not.toContain("<script>");
  });

  it("clé inconnue → chaîne vide", () => {
    expect(renderTemplate("{{inconnu}}", {})).toBe("");
  });

  it("substitutions multiples dans un template", () => {
    const result = renderTemplate("{{a}} et {{b}}", { a: "X", b: "Y" });
    expect(result).toBe("X et Y");
  });

  it("ignore les espaces autour de la clé", () => {
    expect(renderTemplate("{{ client_nom }}", { client_nom: "Test" })).toBe("Test");
  });
});

describe("renderSubject (sujet texte brut)", () => {
  it("substitue sans échapper HTML", () => {
    expect(renderSubject("Devis {{numero}} de {{nom_entreprise}}", { numero: "DEV-001", nom_entreprise: "Durand & Fils" })).toBe(
      "Devis DEV-001 de Durand & Fils",
    );
  });

  it("ne double-échappe pas les &", () => {
    const result = renderSubject("{{nom}}", { nom: "A & B" });
    expect(result).toBe("A & B");
    expect(result).not.toContain("&amp;");
  });
});

describe("buildModeleEmail", () => {
  const modele = { sujet: "Devis {{numero}}", contenu: "<p>Bonjour {{client_nom}}</p>" };

  it("compose sujet + corps depuis le modèle avec substitution", () => {
    const { subject, body } = buildModeleEmail(modele, { numero: "DEV-001", client_nom: "Marie" });
    expect(subject).toBe("Devis DEV-001");
    expect(body).toBe("<p>Bonjour Marie</p>");
  });

  it("echappe les valeurs dans le corps", () => {
    const { body } = buildModeleEmail(modele, { numero: "DEV-001", client_nom: "<b>XSS</b>" });
    expect(body).toContain("&lt;b&gt;XSS&lt;/b&gt;");
  });

  it("ajoute customMessage en bas du corps si fourni", () => {
    const { body } = buildModeleEmail(modele, { numero: "DEV-001", client_nom: "Marie" }, "Note <spéciale>");
    expect(body).toContain("<p");
    expect(body).toContain("Note &lt;spéciale&gt;");
  });

  it("sans customMessage, ne concatène rien de superflu", () => {
    const { body } = buildModeleEmail(modele, { numero: "DEV-001", client_nom: "Marie" });
    expect(body).toBe("<p>Bonjour Marie</p>");
  });
});
