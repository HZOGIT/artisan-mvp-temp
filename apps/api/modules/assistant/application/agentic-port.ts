/*
 * Contrats applicatifs du mode AGENTIQUE de l'assistant (function-calling multi-tours).
 * 
 * La boucle agentique vit dans un use-case (Phase 1) ; ces contrats l'isolent du provider LLM et de
 * l'exécution réelle des outils :
 *   - `LlmAgenticPort`  : un TOUR de conversation (stream texte + function-calls), provider injecté.
 *   - `AssistantToolRegistry` : exécute un outil par nom → `ToolResult`, mappé aux use-cases migrés.
 * 
 * Le re-feed multi-tours se fait via le tableau `messages` : le use-case y rempile le message
 * `model` (parts BRUTES, opaques — elles portent le `thoughtSignature` Gemini 3.x à réinjecter tel
 * quel) puis un message `tool` avec les résultats. Le domaine n'inspecte jamais le contenu opaque.
 */

import type { TenantContext } from "../../../shared/tenant";
import type { ToolSchema } from "../domain/assistant-tools-catalog";
import type { LlmUsage } from "../../../shared/ports/llm";

/** Un appel d'outil émis par le modèle. */
export interface AgenticFunctionCall {
  /** Identifiant éventuel (corrélation appel↔réponse selon le provider ; optionnel). */
  readonly id?: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/** Résultat d'un outil renvoyé au modèle au tour suivant. */
export interface AgenticToolResultPart {
  readonly id?: string;
  readonly name: string;
  /** Charge utile sérialisable (la donnée `ToolResult.data` ou un objet d'erreur). */
  readonly response: unknown;
}

/*
 * Message de conversation agentique. `content` est volontairement OPAQUE (spécifique provider) pour
 * préserver les métadonnées brutes (ex. `thoughtSignature`) à travers les tours sans les modéliser.
 */
export interface AgenticMessage {
  readonly role: "user" | "model" | "tool";
  readonly content: unknown;
}

/** Entrée d'un tour : instruction système, outils exposés (sous-ensemble activé), historique complet. */
export interface AgenticTurnInput {
  readonly system: string;
  readonly tools: readonly ToolSchema[];
  readonly messages: readonly AgenticMessage[];
  readonly model?: string;
}

/*
 * Événements émis pendant un tour : fragments de texte au fil de l'eau, puis un événement terminal
 * portant le message `model` brut (à réinjecter) + les function-calls à exécuter (vide → fin).
 */
export type AgenticEvent =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "turn-complete";
      readonly modelMessage: AgenticMessage;
      readonly functionCalls: readonly AgenticFunctionCall[];
      readonly usage?: LlmUsage;
    };

/*
 * Port LLM agentique : un tour de conversation function-calling, streamé. Le provider (Gemini, …)
 * est injecté ; un `FakeLlmAgenticPort` (Phase 1) scripte les function-calls pour tester la boucle.
 */
export interface LlmAgenticPort {
  streamTurn(input: AgenticTurnInput): AsyncIterable<AgenticEvent>;
}

/** Résultat d'exécution d'un outil (parité legacy `ToolResult`). */
export type ToolResult =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly error: string };

/*
 * Registre d'exécution des outils : mappe chaque nom d'outil → use-case du domaine concerné, sous le
 * `TenantContext` (isolation + ownership). `tools` = les schémas réellement exposés au modèle (on
 * active LECTURES d'abord, écritures ensuite — cf. plan de portage).
 */
export interface AssistantToolRegistry {
  readonly tools: readonly ToolSchema[];
  execute(name: string, args: Record<string, unknown>, ctx: TenantContext): Promise<ToolResult>;
}
