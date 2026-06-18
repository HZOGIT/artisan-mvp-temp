import { describe, it, expect } from "vitest";
import { TooManyRequestsError, ValidationError } from "../../../shared/errors";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader, ArtisanInfo } from "../../../shared/readers/contact-readers";
import type { TenantContext } from "../../../shared/tenant";
import type { ConseilsStatsReader } from "../../conseils-ia/application/conseils-stats-reader";
import { findTool } from "../domain/assistant-tools-catalog";
import { FakeAssistantThreadWriter } from "../infra/assistant-thread-writer-fake";
import { FakeAssistantToolRegistry, FakeLlmAgenticPort, type ScriptedTurn } from "../infra/llm-agentic-fake";
import type { ToolResult } from "./agentic-port";
import { MAX_AGENT_TURNS, runAssistantAgent, type AssistantAgentEvent } from "./assistant-agent-use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const allow: RateLimiterPort = { check: async () => true };
const deny: RateLimiterPort = { check: async () => false };
const stats: ConseilsStatsReader = { getStats: async () => ({ nbDevisEnAttente: 3, nbFacturesImpayees: 2, montantImpayees: 1500, nbStocksBas: 0 }) };
const artisan: ArtisanInfo = { id: 1, nomEntreprise: "Plomberie X", email: null, metier: "plomberie" };
class FakeArtisan implements ArtisanReader {
  async getArtisan(): Promise<ArtisanInfo | null> {
    return artisan;
  }
}
const TOOLS = [findTool("lister_factures")!, findTool("creer_client")!];

function build(opts: {
  script: ScriptedTurn[];
  rl?: RateLimiterPort;
  handler?: (name: string, args: Record<string, unknown>) => ToolResult;
}) {
  const writer = new FakeAssistantThreadWriter();
  const llm = new FakeLlmAgenticPort(opts.script);
  const registry = new FakeAssistantToolRegistry(TOOLS, opts.handler);
  return {
    writer,
    llm,
    registry,
    deps: { llm, registry, rateLimiter: opts.rl ?? allow, artisanReader: new FakeArtisan(), statsReader: stats, threadWriter: writer },
  };
}

async function collect(gen: AsyncGenerator<AssistantAgentEvent>): Promise<AssistantAgentEvent[]> {
  const out: AssistantAgentEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe("runAssistantAgent", () => {
  it("message vide → ValidationError (400)", async () => {
    const { deps } = build({ script: [{ text: ["x"] }] });
    await expect(collect(runAssistantAgent(deps, ctx(1), { message: "  " }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rate-limit atteint → TooManyRequestsError (429)", async () => {
    const { deps } = build({ script: [{ text: ["x"] }], rl: deny });
    await expect(collect(runAssistantAgent(deps, ctx(1), { message: "salut" }))).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("aucun outil : streame le texte, persiste user+assistant, système = prompt métier", async () => {
    const { deps, writer, llm } = build({ script: [{ text: ["Bon", "jour"] }] });
    const events = await collect(runAssistantAgent(deps, ctx(1), { message: "Aide-moi" }));
    expect(events[0]).toHaveProperty("threadId");
    expect(events.slice(1)).toEqual([{ content: "Bon" }, { content: "jour" }]);
    expect(events.some((e) => "toolStart" in e)).toBe(false);
    expect(llm.turnInputs[0].system).toContain("MonAssistant");
    expect(llm.turnInputs[0].tools).toBe(TOOLS);
    expect(writer.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(writer.messages[1].transcript).toBe("Bonjour");
  });

  it("1 outil de LECTURE : exécute, réinjecte le résultat, puis répond ; pas d'invalidation", async () => {
    const { deps, registry, llm } = build({
      script: [{ text: ["Je regarde."], calls: [{ name: "lister_factures", args: {} }] }, { text: ["Tu as 2 factures."] }],
    });
    const events = await collect(runAssistantAgent(deps, ctx(7), { message: "mes factures ?" }));
    // séquence : threadId, texte tour 1, toolStart, toolEnd, texte tour 2 (contrat client)
    expect(events).toEqual([
      { threadId: expect.any(Number) },
      { content: "Je regarde." },
      { toolStart: { name: "lister_factures", args: {} } },
      { toolEnd: { name: "lister_factures", ok: true } },
      { content: "Tu as 2 factures." },
    ]);
    // outil exécuté sous le bon tenant
    expect(registry.calls).toEqual([{ name: "lister_factures", args: {}, artisanId: 7 }]);
    // réinjection : tour 2 reçoit [user, model(tour1), tool]
    expect(llm.turnInputs).toHaveLength(2);
    expect(llm.turnInputs[1].messages.map((m) => m.role)).toEqual(["user", "model", "tool"]);
    // pas d'invalidation pour une lecture
    expect(events.some((e) => "invalidate" in e)).toBe(false);
  });

  it("naviguer_vers réussi → émet {navigate, filtre} (le client redirige) — parité legacy", async () => {
    const { deps } = build({
      script: [{ calls: [{ name: "naviguer_vers", args: { page: "/factures", filtre: "impayees" } }] }, { text: ["Voilà vos factures."] }],
      handler: (name) => (name === "naviguer_vers" ? { ok: true, data: { navigate: { page: "/factures", filtre: "impayees" }, confirmation: "ok" } } : { ok: true, data: {} }),
    });
    const events = await collect(runAssistantAgent(deps, ctx(1), { message: "montre mes factures impayées" }));
    expect(events).toContainEqual({ navigate: "/factures", filtre: "impayees" });
    expect(events).toContainEqual({ toolStart: { name: "naviguer_vers", args: { page: "/factures", filtre: "impayees" } } });
    expect(events).toContainEqual({ toolEnd: { name: "naviguer_vers", ok: true } });
  });

  it("outil d'ÉCRITURE réussi → émet {invalidate} (clés TOOL_INVALIDATIONS)", async () => {
    const { deps } = build({
      script: [{ calls: [{ name: "creer_client", args: { nom: "Dupont" } }] }, { text: ["Client créé."] }],
    });
    const events = await collect(runAssistantAgent(deps, ctx(1), { message: "crée un client Dupont" }));
    expect(events).toContainEqual({ invalidate: ["clients"] });
    expect(events).toContainEqual({ toolStart: { name: "creer_client", args: { nom: "Dupont" } } });
    expect(events).toContainEqual({ toolEnd: { name: "creer_client", ok: true } });
  });

  it("outil en échec → pas d'invalidation, le résultat est réinjecté, la boucle continue", async () => {
    const { deps, registry } = build({
      script: [{ calls: [{ name: "creer_client", args: {} }] }, { text: ["Il me manque le nom."] }],
      handler: () => ({ ok: false, error: "nom requis" }),
    });
    const events = await collect(runAssistantAgent(deps, ctx(1), { message: "crée un client" }));
    expect(events.some((e) => "invalidate" in e)).toBe(false);
    expect(events).toContainEqual({ content: "Il me manque le nom." });
    expect(registry.calls).toHaveLength(1);
  });

  it("borne MAX_AGENT_TURNS : un modèle qui boucle ne dépasse jamais le plafond", async () => {
    // 12 tours qui appellent TOUJOURS un outil → la boucle s'arrête à MAX_AGENT_TURNS.
    const script: ScriptedTurn[] = Array.from({ length: MAX_AGENT_TURNS + 2 }, () => ({ calls: [{ name: "lister_factures", args: {} }] }));
    const { deps, registry, llm } = build({ script });
    await collect(runAssistantAgent(deps, ctx(1), { message: "boucle" }));
    expect(llm.turnInputs).toHaveLength(MAX_AGENT_TURNS);
    expect(registry.calls).toHaveLength(MAX_AGENT_TURNS);
  });

  it("réutilise le threadId fourni (aucun thread créé)", async () => {
    const { deps, writer } = build({ script: [{ text: ["ok"] }] });
    const events = await collect(runAssistantAgent(deps, ctx(1), { message: "salut", threadId: 42 }));
    expect(events[0]).toEqual({ threadId: 42 });
    expect(writer.threads).toHaveLength(0);
    expect(writer.messages.every((m) => m.threadId === 42)).toBe(true);
  });
});
