// Port LLM (génération de texte). Les use-cases en dépendent (interface), jamais d'une impl
// concrète (Gemini, etc.). `complete` renvoie la complétion entière ; `stream` émet des fragments
// de texte au fil de l'eau (assistant/chat SSE — le dispatcher edge est déjà streaming-safe).

export interface LlmCompleteOptions {
  // Modèle (défaut : variable d'env GEMINI_TEXT_MODEL puis "gemini-2.5-flash").
  readonly model?: string;
  // Instruction système (rôle/ton) — séparée du prompt utilisateur.
  readonly system?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface LlmPort {
  // Complétion synchrone (texte complet). Rejette en cas d'échec du provider.
  complete(prompt: string, opts?: LlmCompleteOptions): Promise<string>;
  // Complétion en flux : itère des fragments de texte (à concaténer côté appelant).
  stream(prompt: string, opts?: LlmCompleteOptions): AsyncIterable<string>;
}
