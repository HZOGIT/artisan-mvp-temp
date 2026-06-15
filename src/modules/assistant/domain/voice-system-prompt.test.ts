import { describe, it, expect } from "vitest";
import { findTool } from "./assistant-tools-catalog";
import { buildVoiceSystemInstruction } from "./voice-system-prompt";

const TOOLS = [findTool("lister_factures")!, findTool("creer_client")!];

describe("buildVoiceSystemInstruction", () => {
  it("ajoute la liste des outils + les règles strictes au prompt de base", () => {
    const out = buildVoiceSystemInstruction({ baseSystem: "PROMPT", history: [], tools: TOOLS });
    expect(out).toContain("PROMPT");
    expect(out).toContain("OUTILS DISPONIBLES");
    expect(out).toContain("- lister_factures :");
    expect(out).toContain("- creer_client :");
    expect(out).toContain("RÈGLES STRICTES");
    expect(out).toContain('N\'écris/ne prononce JAMAIS "Tool call:"');
    // pas d'historique → pas de bloc historique
    expect(out).not.toContain("Historique récent");
  });

  it("ajoute le bloc historique (rôles mappés Artisan/Assistant) quand présent", () => {
    const out = buildVoiceSystemInstruction({
      baseSystem: "P",
      history: [
        { role: "user", transcript: "Bonjour" },
        { role: "assistant", transcript: "Bonjour, comment puis-je aider ?" },
      ],
      tools: TOOLS,
    });
    expect(out).toContain("Historique récent de la conversation");
    expect(out).toContain("Artisan: Bonjour");
    expect(out).toContain("Assistant: Bonjour, comment puis-je aider ?");
  });
});
