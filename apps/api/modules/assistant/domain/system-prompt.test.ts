import { describe, it, expect } from "vitest";
import { buildAssistantSystemPrompt, buildUserPrompt } from "./system-prompt";

describe("assistant system-prompt (pur)", () => {
  it("buildAssistantSystemPrompt : rôle + artisan + stats + contexte de page", () => {
    const p = buildAssistantSystemPrompt({
      artisanName: "Plomberie X",
      metier: "plomberie",
      stats: { devisEnCours: 3, facturesImpayeesCount: 2, facturesImpayeesTotal: 1500.5 },
      pageContext: "page Devis",
    });
    expect(p).toContain("MonAssistant");
    expect(p).toContain("Plomberie X");
    expect(p).toContain("3 devis en attente");
    expect(p).toContain("2 factures impayées pour un total de 1500.50 euros");
    expect(p).toContain("Contexte actuel : page Devis");
  });

  it("buildAssistantSystemPrompt : sans artisan/métier/pageContext → défauts", () => {
    const p = buildAssistantSystemPrompt({ artisanName: null, metier: null, stats: { devisEnCours: 0, facturesImpayeesCount: 0, facturesImpayeesTotal: 0 } });
    expect(p).toContain("Artisan");
    expect(p).not.toContain("Contexte actuel");
  });

  it("buildUserPrompt : sans historique → message seul ; avec historique → transcript + message", () => {
    expect(buildUserPrompt([], "salut")).toBe("salut");
    const p = buildUserPrompt([{ role: "user", content: "bonjour" }, { role: "assistant", content: "bonjour !" }], "et après ?");
    expect(p).toContain("Utilisateur : bonjour");
    expect(p).toContain("Assistant : bonjour !");
    expect(p).toContain("Utilisateur : et après ?");
  });

  it("buildUserPrompt : borne aux 10 derniers tours", () => {
    const history = Array.from({ length: 15 }, (_, i) => ({ role: "user", content: `msg${i}` }));
    const p = buildUserPrompt(history, "fin");
    expect(p).not.toContain("msg4"); // tronqué (15-10=5 premiers exclus)
    expect(p).toContain("msg14");
  });
});
