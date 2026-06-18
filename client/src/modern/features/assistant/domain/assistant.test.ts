import { describe, expect, it } from "vitest";
import { parseStreamData, splitSseBuffer, sseDataLine, sliceHistory, navigateTarget, buildDevisMarkdown, buildRelancesMarkdown, type Message, type DevisLigne, type RelanceItem } from "./assistant";

describe("assistant — domain pur", () => {
  it("parseStreamData : [DONE], JSON valide typé, JSON invalide → null", () => {
    expect(parseStreamData("[DONE]")).toBe("done");
    expect(parseStreamData('{"content":"hi","threadId":5}')).toEqual({ content: "hi", threadId: 5 });
    expect(parseStreamData('{"navigate":"/devis","filtre":"x","invalidate":["devis",3]}')).toEqual({ navigate: "/devis", filtre: "x", invalidate: ["devis"] });
    expect(parseStreamData("pas du json")).toBeNull();
  });

  it("splitSseBuffer / sseDataLine", () => {
    expect(splitSseBuffer("a\nb\nrest")).toEqual({ lines: ["a", "b"], rest: "rest" });
    expect(sseDataLine("data: {\"x\":1}")).toBe('{"x":1}');
    expect(sseDataLine("event: ping")).toBeNull();
  });

  it("sliceHistory : N derniers (rôle+contenu)", () => {
    const msgs: Message[] = Array.from({ length: 15 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const h = sliceHistory(msgs, 10);
    expect(h).toHaveLength(10);
    expect(h[0].content).toBe("m5");
  });

  it("navigateTarget : filtre encodé optionnel", () => {
    expect(navigateTarget("/devis")).toBe("/devis");
    expect(navigateTarget("/devis", "à payer")).toBe("/devis?filtre=%C3%A0%20payer");
  });

  it("buildDevisMarkdown : tableau + total HT", () => {
    const lignes: DevisLigne[] = [{ designation: "Pose", quantite: 2, unite: "u", prixUnitaireHT: 50, tauxTVA: 20 }];
    const md = buildDevisMarkdown("Test", lignes);
    expect(md).toContain("Devis suggéré pour : Test");
    expect(md).toContain("| Pose | 2 | u | 50.00 | 20% |");
    expect(md).toContain("Total HT : 100.00 EUR");
  });

  it("buildRelancesMarkdown : tableau / vide / chaîne / {suggestions}", () => {
    const items: RelanceItem[] = [{ numero: "D-1", objet: "Toit", email: { sujet: "Relance", corps: "Bonjour" } }];
    expect(buildRelancesMarkdown(items)).toContain("**D-1** - Toit");
    expect(buildRelancesMarkdown([])).toContain("Aucun devis en attente");
    expect(buildRelancesMarkdown("texte brut")).toBe("texte brut");
    expect(buildRelancesMarkdown({ suggestions: "sugg" })).toBe("sugg");
  });
});
