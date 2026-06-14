import { NotFoundError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { VisionPort } from "../../../shared/ports/vision";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { IDepenseRepository } from "./depense-repository";
import { sanitizeIaError } from "../../../shared/ia/sanitize-ia-error";

// Use-case `analyserJustificatif` : OCR d'un justificatif (facture/note de frais) via un modèle
// vision. Parité legacy `depenses.analyserJustificatif`. ⚠️ Invariants :
//  - **rate-limit IA AVANT tout** (anti-coût) → 429 ;
//  - **anti-IDOR** : si `depenseId` fourni, on vérifie l'ownership AVANT l'appel modèle (évite un
//    appel gaspillé + une écriture cross-tenant de l'OCR) ;
//  - parse JSON défensif ; erreurs **assainies** (jamais de fuite base64/clé) → `{success:false}`.

export interface AnalyserJustificatifDeps {
  readonly vision: VisionPort;
  readonly rateLimiter: RateLimiterPort;
  readonly depenseRepo: IDepenseRepository;
}

export interface AnalyserJustificatifInput {
  readonly imageBase64: string; // data URL (`data:image/...;base64,…`) ou base64 brut
  readonly depenseId?: number;
}

export interface AnalyserJustificatifResult {
  readonly success: boolean;
  readonly data: Record<string, unknown>;
  readonly error?: string;
}

const OCR_PROMPT = `Analyse cette facture / note de frais. Extrais les informations en JSON :
{"fournisseur":"nom","date":"YYYY-MM-DD","montantHT":0,"tauxTVA":20,"montantTTC":0,"categorie":"materiaux|carburant|outillage|repas|deplacement|telephone|sous-traitance|assurance|loyer|formation|bancaire|autre","description":"description courte","numeroFacture":"numero si visible"}
Reponds UNIQUEMENT avec le JSON, pas de texte autour.`;

function rateLimitKey(artisanId: number): string {
  return `ia:${artisanId}`;
}

export async function analyserJustificatif(
  deps: AnalyserJustificatifDeps,
  ctx: TenantContext,
  input: AnalyserJustificatifInput,
): Promise<AnalyserJustificatifResult> {
  if (!(await deps.rateLimiter.check(rateLimitKey(ctx.artisanId)))) {
    throw new TooManyRequestsError("Limite IA atteinte. Réessayez dans un moment.");
  }
  // Anti-IDOR : la dépense ciblée doit appartenir au tenant AVANT l'appel modèle (anti gaspillage +
  // anti-écriture cross-tenant de l'OCR).
  if (input.depenseId != null) {
    if (!(await deps.depenseRepo.getById(ctx, input.depenseId))) throw new NotFoundError("Dépense introuvable");
  }

  // Détecte le data URL et extrait le base64 brut + le mimeType.
  const m = input.imageBase64.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
  const mimeType = m?.[1] ?? "image/jpeg";
  const base64 = m ? m[2] : input.imageBase64;

  try {
    const text = await deps.vision.analyzeImage({ mimeType, base64, prompt: OCR_PROMPT, maxOutputTokens: 1000 });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let data: Record<string, unknown> = {};
    if (jsonMatch) {
      try {
        data = JSON.parse(jsonMatch[0]);
      } catch {
        data = {};
      }
    }
    if (input.depenseId != null) await deps.depenseRepo.setOcr(ctx, input.depenseId, data);
    return { success: true, data };
  } catch (e) {
    return { success: false, data: {}, error: `OCR IA echouee : ${sanitizeIaError(e)}` };
  }
}
