import type { TenantContext } from "../../../shared/tenant";
import { ASSISTANT_TOOLS, isWriteTool, type ToolSchema } from "../domain/assistant-tools-catalog";
import { resolveNavigation } from "../domain/navigation";
import type { AssistantToolRegistry, ToolResult } from "./agentic-port";

// Handler d'un outil de LECTURE : exécute l'outil sous le tenant → `ToolResult`.
export type ReadToolHandler = (args: Record<string, unknown>, ctx: TenantContext) => Promise<ToolResult>;

// Registre des outils de l'assistant agentique, version LECTURE SEULE (Phase 1b).
//   - `naviguer_vers` : handler PUR intégré (aucune dépendance données).
//   - autres lectures : injectées au fil de l'eau (un domaine migré par firing), mappées aux readers.
//   - ÉCRITURES : refusées (activées en Phase 2 avec garde-fous).
// `tools` = les schémas des outils de lecture EFFECTIVEMENT câblés (on n'expose pas au modèle un outil
// qui répondrait « indisponible »). Un outil inconnu / non câblé / écriture → `{ok:false}`.
export class AssistantReadToolRegistry implements AssistantToolRegistry {
  private readonly handlers: Map<string, ReadToolHandler>;
  public readonly tools: readonly ToolSchema[];

  constructor(handlers: Record<string, ReadToolHandler> = {}) {
    this.handlers = new Map(Object.entries(handlers));
    // `naviguer_vers` : pur, toujours disponible (sauf override explicite).
    if (!this.handlers.has("naviguer_vers")) {
      this.handlers.set("naviguer_vers", async (args) => {
        const r = resolveNavigation(args);
        return r.ok ? { ok: true, data: { navigate: r.navigate, confirmation: r.confirmation } } : { ok: false, error: r.error };
      });
    }
    // N'expose que des outils de LECTURE réellement câblés (jamais une écriture, jamais un non-câblé).
    this.tools = ASSISTANT_TOOLS.filter((t) => !isWriteTool(t.name) && this.handlers.has(t.name));
  }

  async execute(name: string, args: Record<string, unknown>, ctx: TenantContext): Promise<ToolResult> {
    if (isWriteTool(name)) return { ok: false, error: "Action non disponible (écriture désactivée pour l'instant)" };
    const handler = this.handlers.get(name);
    if (!handler) return { ok: false, error: `Outil indisponible : ${name}` };
    return handler(args, ctx);
  }
}
