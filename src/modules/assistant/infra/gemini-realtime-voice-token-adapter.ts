import { RealtimeTokenError, type RealtimeVoiceTokenPort, type VoiceTokenMinted, type VoiceTokenSetup } from "../application/voice-token-use-cases";
import { toGeminiTools } from "./gemini-agentic-adapter";

// Adapter Gemini du mint vocal : POST `v1alpha/auth_tokens` (token éphémère pour la session Live). Body
// FLAT snake_case (l'endpoint éphémère n'est pas exposé par le SDK @google/genai). `fetch` global (Node
// 18+) → pas de SDK ni d'import variable-de-chemin. Le mapping du body est PUR (`buildAuthTokenBody`).

const LIVE_MODEL_DEFAULT = "gemini-2.5-flash-native-audio-latest";
const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

// Construit le body d'auth_tokens (PUR, testable) : 1 usage, token 30 min, session à démarrer < 1 min ;
// setup Live AUDIO + transcriptions in/out + system instruction + outils (`function_declarations`).
export function buildAuthTokenBody(setup: VoiceTokenSetup, model: string, now: number): Record<string, unknown> {
  const wrapped = toGeminiTools(setup.tools)[0] as { functionDeclarations?: unknown } | undefined;
  const functionDeclarations = wrapped?.functionDeclarations ?? [];
  return {
    uses: 1,
    expire_time: new Date(now + 30 * 60 * 1000).toISOString(),
    new_session_expire_time: new Date(now + 60 * 1000).toISOString(),
    bidi_generate_content_setup: {
      model: `models/${model}`,
      generation_config: {
        response_modalities: ["AUDIO"],
        speech_config: { voice_config: { prebuilt_voice_config: { voice_name: "Aoede" } } },
      },
      system_instruction: { parts: [{ text: setup.systemText }] },
      input_audio_transcription: {},
      output_audio_transcription: {},
      tools: [{ function_declarations: functionDeclarations }],
    },
  };
}

export class GeminiRealtimeVoiceTokenAdapter implements RealtimeVoiceTokenPort {
  async mint(setup: VoiceTokenSetup): Promise<VoiceTokenMinted> {
    const model = process.env.GEMINI_LIVE_MODEL || LIVE_MODEL_DEFAULT;
    const apiKey = process.env.GEMINI_API_KEY ?? "";
    const now = Date.now();
    const body = buildAuthTokenBody(setup, model, now);

    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new RealtimeTokenError(`Échec réseau auth_tokens : ${e instanceof Error ? e.message : "inconnu"}`);
    }
    if (!res.ok) throw new RealtimeTokenError(`Gemini auth_tokens ${res.status}`);

    const data = (await res.json()) as { name?: string; token?: string };
    return {
      token: data.name ?? data.token ?? "",
      wsUrl: WS_URL,
      model,
      expiresAt: String(body.expire_time),
    };
  }
}
