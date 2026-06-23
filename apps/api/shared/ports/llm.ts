/*
 * Port LLM (génération de texte). Les use-cases en dépendent (interface), jamais d'une impl
 * concrète (Gemini, etc.). `complete` renvoie la complétion entière + métadonnées de tokens ;
 * `stream` émet des fragments de texte puis un chunk final `done` avec les métadonnées.
 */

/** Métadonnées de consommation retournées par chaque appel LLM (noms SDK @google/genai v1.52). */
export interface LlmUsage {
  readonly model: string;
  readonly durationMs: number;
  readonly finishReason: string;

  /** Totaux scalaires */
  readonly promptTokens: number;
  readonly responseTokens: number;
  readonly thinkingTokens: number;
  readonly cachedTokens: number;
  readonly toolUseTokens: number;
  readonly totalTokens: number;

  /** Détail INPUT par modalité */
  readonly textInputTokens: number;
  readonly audioInputTokens: number;
  readonly imageInputTokens: number;
  readonly videoInputTokens: number;

  /** Détail OUTPUT par modalité */
  readonly textOutputTokens: number;
  readonly audioOutputTokens: number;

  /** Tier de facturation (ON_DEMAND | ON_DEMAND_PRIORITY | ON_DEMAND_FLEX | PROVISIONED_THROUGHPUT) */
  readonly trafficType: string | null;
}

export interface LlmResult {
  readonly text: string;
  readonly usage: LlmUsage;
}

export type LlmStreamChunk =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "done"; readonly usage: LlmUsage };

export interface LlmCompleteOptions {
  readonly model?: string;
  readonly system?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface LlmPort {
  /** Complétion synchrone — retourne le texte ET les métadonnées de tokens. */
  complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResult>;
  /** Complétion en flux : émet des chunks `{kind:"text"}` puis un chunk final `{kind:"done",usage}`. */
  stream(prompt: string, opts?: LlmCompleteOptions): AsyncIterable<LlmStreamChunk>;
}
