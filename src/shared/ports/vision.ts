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

// Image d'une requête multi-image : soit inline (base64, ex. data:URL parsée), soit par URI public
// (http(s), `fileData`). `mimeType` requis dans les deux cas.
export interface VisionImage {
  readonly mimeType: string;
  readonly base64?: string; // données inline (base64 sans préfixe data:)
  readonly fileUri?: string; // URL publique (alternative à base64)
}

export interface VisionMultiRequest {
  readonly images: readonly VisionImage[];
  readonly prompt: string;
  readonly system?: string;
  readonly model?: string;
  readonly maxOutputTokens?: number;
}

export interface VisionPort {
  analyzeImage(req: VisionRequest): Promise<string>;
  // Analyse MULTI-image (ex. plusieurs photos de chantier en un seul appel multimodal). Renvoie le
  // texte brut produit par le modèle.
  analyzeImages(req: VisionMultiRequest): Promise<string>;
}
