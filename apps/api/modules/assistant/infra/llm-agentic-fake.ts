import type { TenantContext } from "../../../shared/tenant";
import type {
  AgenticEvent,
  AgenticFunctionCall,
  AgenticMessage,
  AgenticTurnInput,
  AssistantToolRegistry,
  LlmAgenticPort,
  ToolResult,
} from "../application/agentic-port";
import type { ToolSchema } from "../domain/assistant-tools-catalog";

// Un tour scripté : des fragments de texte streamés, puis (éventuellement) des function-calls.
export interface ScriptedTurn {
  readonly text?: readonly string[];
  readonly calls?: readonly AgenticFunctionCall[];
}

/*
 * Fake du port agentique : rejoue un script de tours (n-ième appel à `streamTurn` = n-ième tour ;
 * script épuisé → tour vide, donc fin de boucle). Capture les `messages` reçus à chaque tour pour
 * vérifier la réinjection (model + tool) sans réseau.
 */
export class FakeLlmAgenticPort implements LlmAgenticPort {
  public readonly turnInputs: AgenticTurnInput[] = [];
  private callCount = 0;
  constructor(private readonly script: readonly ScriptedTurn[]) {}

  async *streamTurn(input: AgenticTurnInput): AsyncIterable<AgenticEvent> {
    // Snapshot des messages (le use-case mute le tableau entre les tours) → observation fidèle du re-feed.
    this.turnInputs.push({ ...input, messages: [...input.messages] });
    const turn = this.script[this.callCount] ?? {};
    this.callCount++;
    const fragments = turn.text ?? [];
    for (const t of fragments) yield { kind: "text", text: t };
    const functionCalls = turn.calls ?? [];
    // Message `model` brut/opaque (round-trip), porte le contenu du tour.
    const modelMessage: AgenticMessage = { role: "model", content: { kind: "raw", text: fragments.join(""), calls: functionCalls } };
    yield { kind: "turn-complete", modelMessage, functionCalls };
  }
}

// Fake du registre d'outils : capture les appels et délègue à un handler scriptable (succès par défaut).
export class FakeAssistantToolRegistry implements AssistantToolRegistry {
  public readonly calls: { name: string; args: Record<string, unknown>; artisanId: number }[] = [];
  constructor(
    public readonly tools: readonly ToolSchema[],
    private readonly handler: (name: string, args: Record<string, unknown>) => ToolResult = () => ({ ok: true, data: { ok: true } }),
  ) {}

  async execute(name: string, args: Record<string, unknown>, ctx: TenantContext): Promise<ToolResult> {
    this.calls.push({ name, args, artisanId: ctx.artisanId });
    return this.handler(name, args);
  }
}
