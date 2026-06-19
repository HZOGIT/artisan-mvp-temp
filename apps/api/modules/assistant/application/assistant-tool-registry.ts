import type { TenantContext } from "../../../shared/tenant";
import { ASSISTANT_TOOLS, isWriteTool, type ToolSchema } from "../domain/assistant-tools-catalog";
import { resolveNavigation } from "../domain/navigation";
import type { AssistantToolRegistry, ToolResult } from "./agentic-port";

/** Handler d'un outil : exécute l'outil sous le tenant → `ToolResult` (lecture ou écriture). */
export type ToolHandler = (args: Record<string, unknown>, ctx: TenantContext) => Promise<ToolResult>;
/** alias historique (lecture) */
export type ReadToolHandler = ToolHandler;

/*
 * Registre des outils de l'assistant agentique.
 *   - `naviguer_vers` : handler PUR intégré (aucune dépendance données).
 *   - LECTURES : injectées au fil de l'eau (un domaine migré par firing), mappées aux readers.
 *   - ÉCRITURES : **opt-in** via `writeHandlers` (Phase 2, garde-fous). Sans handler d'écriture →
 *     refus (défaut sûr : le registry de LECTURE seule reste le défaut).
 * `tools` = les schémas des outils EFFECTIVEMENT câblés (on n'expose pas au modèle un outil qui
 * répondrait « indisponible »). Un outil inconnu / non câblé / écriture sans handler → `{ok:false}`.
 */
export class AssistantReadToolRegistry implements AssistantToolRegistry {
  private readonly handlers: Map<string, ToolHandler>;
  private readonly writeHandlers: Map<string, ToolHandler>;
  public readonly tools: readonly ToolSchema[];

  constructor(handlers: Record<string, ToolHandler> = {}, writeHandlers: Record<string, ToolHandler> = {}) {
    this.handlers = new Map(Object.entries(handlers));
    /** `naviguer_vers` : pur, toujours disponible (sauf override explicite). */
    if (!this.handlers.has("naviguer_vers")) {
      this.handlers.set("naviguer_vers", async (args) => {
        const r = resolveNavigation(args);
        return r.ok ? { ok: true, data: { navigate: r.navigate, confirmation: r.confirmation } } : { ok: false, error: r.error };
      });
    }
    this.writeHandlers = new Map(Object.entries(writeHandlers));
    /** N'expose que des outils réellement câblés : lecture (readers) ou écriture (writeHandlers). */
    this.tools = ASSISTANT_TOOLS.filter((t) => (isWriteTool(t.name) ? this.writeHandlers.has(t.name) : this.handlers.has(t.name)));
  }

  async execute(name: string, args: Record<string, unknown>, ctx: TenantContext): Promise<ToolResult> {
    if (isWriteTool(name)) {
      const writer = this.writeHandlers.get(name);
      if (!writer) return { ok: false, error: "Action non disponible (écriture désactivée pour l'instant)" };
      return writer(args, ctx);
    }
    const handler = this.handlers.get(name);
    if (!handler) return { ok: false, error: `Outil indisponible : ${name}` };
    return handler(args, ctx);
  }
}
