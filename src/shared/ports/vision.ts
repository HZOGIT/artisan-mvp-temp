// Port « vision » (analyse d'image par LLM multimodal). Séparé du `LlmPort` (texte) car l'appel
// passe une image en `inlineData` (mimeType + base64). Les use-cases en dépendent (interface), jamais
// d'une impl concrète (Gemini). `analyzeImage` renvoie le texte brut produit par le modèle.

export interface VisionRequest {
  readonly mimeType: string; // ex. "image/jpeg"
  readonly base64: string; // données image en base64 (sans préfixe data:)
  readonly prompt: string; // instruction utilisateur (ex. "extrais le JSON…")
  readonly system?: string;
  readonly model?: string;
  readonly maxOutputTokens?: number;
}

export interface VisionPort {
  analyzeImage(req: VisionRequest): Promise<string>;
}
