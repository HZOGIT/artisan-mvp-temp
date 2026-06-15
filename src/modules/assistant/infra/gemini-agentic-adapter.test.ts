import { describe, it, expect } from "vitest";
import { findTool, type ToolSchema } from "../domain/assistant-tools-catalog";
import type { AgenticMessage } from "../application/agentic-port";
import { toGeminiParam, toGeminiFunctionDeclaration, toGeminiTools, toGeminiContents } from "./gemini-agentic-adapter";

// Mappers PURS de l'adapter Gemini agentique : verrouillent la traduction neutre→Gemini (types en
// MAJUSCULE, function-calls, round-trip des parts model brutes pour le thoughtSignature).

describe("gemini-agentic-adapter — mappers purs", () => {
  it("toGeminiParam : type neutre → MAJUSCULE, récursif (properties/items/required)", () => {
    const p = toGeminiParam({
      type: "object",
      properties: {
        clientId: { type: "number", description: "id" },
        lignes: { type: "array", items: { type: "object", properties: { designation: { type: "string" } }, required: ["designation"] } },
      },
      required: ["clientId"],
    });
    expect(p.type).toBe("OBJECT");
    expect((p.properties as Record<string, { type: string }>).clientId.type).toBe("NUMBER");
    const lignes = (p.properties as Record<string, { type: string; items: { type: string; properties: Record<string, { type: string }>; required: string[] } }>).lignes;
    expect(lignes.type).toBe("ARRAY");
    expect(lignes.items.type).toBe("OBJECT");
    expect(lignes.items.properties.designation.type).toBe("STRING");
    expect(lignes.items.required).toEqual(["designation"]);
    expect(p.required).toEqual(["clientId"]);
  });

  it("toGeminiFunctionDeclaration : name/description/parameters préservés", () => {
    const tool = findTool("chercher_client") as ToolSchema;
    const fd = toGeminiFunctionDeclaration(tool);
    expect(fd.name).toBe("chercher_client");
    expect(fd.description).toBe(tool.description);
    expect((fd.parameters as { type: string }).type).toBe("OBJECT");
  });

  it("toGeminiTools : [{ functionDeclarations }] ; vide → []", () => {
    const tools = [findTool("naviguer_vers")!, findTool("lister_factures")!];
    const out = toGeminiTools(tools) as Array<{ functionDeclarations: Array<{ name: string }> }>;
    expect(out).toHaveLength(1);
    expect(out[0].functionDeclarations.map((d) => d.name)).toEqual(["naviguer_vers", "lister_factures"]);
    expect(toGeminiTools([])).toEqual([]);
  });

  it("toGeminiContents : user/text, model/text (historique), tool→functionResponse(role user), model brut round-trip", () => {
    const rawParts = [{ text: "ok" }, { functionCall: { name: "lister_factures", args: {} }, thoughtSignature: "SIG" }];
    const messages: AgenticMessage[] = [
      { role: "user", content: { kind: "text", text: "salut" } },
      { role: "model", content: { kind: "text", text: "bonjour" } }, // historique
      { role: "model", content: { kind: "raw", parts: rawParts } }, // tour précédent (brut)
      { role: "tool", content: { kind: "tool-results", results: [{ name: "lister_factures", response: { ok: true, data: { count: 2 } } }] } },
    ];
    const out = toGeminiContents(messages) as Array<{ role: string; parts: unknown[] }>;
    expect(out[0]).toEqual({ role: "user", parts: [{ text: "salut" }] });
    expect(out[1]).toEqual({ role: "model", parts: [{ text: "bonjour" }] });
    // round-trip BRUT : les parts (incl. thoughtSignature) sont conservées telles quelles
    expect(out[2]).toEqual({ role: "model", parts: rawParts });
    expect(out[3]).toEqual({ role: "user", parts: [{ functionResponse: { name: "lister_factures", response: { ok: true, data: { count: 2 } } } }] });
  });
});
