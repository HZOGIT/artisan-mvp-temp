import type { TenantContext } from "../../../shared/tenant";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import type { ConseilsStatsReader } from "../../conseils-ia/application/conseils-stats-reader";
import type { ToolSchema } from "../domain/assistant-tools-catalog";
import { buildAssistantSystemPrompt } from "../domain/system-prompt";
import { buildVoiceSystemInstruction } from "../domain/voice-system-prompt";
import type { AssistantThreadWriter } from "./assistant-thread-writer";
import type { IAssistantThreadsRepository } from "./assistant-threads-repository";

// Mint d'un token éphémère pour la session vocale Live (parité legacy `/api/voice/token`) : crée/réutilise
// un thread (pour persister les tours via voice/persist), construit l'instruction système (métier + stats
// + historique + outils + règles), puis délègue le mint au provider (port). Le setup déclare les outils.

export interface VoiceTokenSetup {
  readonly systemText: string;
  readonly tools: readonly ToolSchema[];
}
export interface VoiceTokenMinted {
  readonly token: string;
  readonly wsUrl: string;
  readonly model: string;
  readonly expiresAt: string;
}
// Provider de mint (Gemini Live `v1alpha/auth_tokens`, …) — injecté ; un Fake teste l'orchestration sans réseau.
export interface RealtimeVoiceTokenPort {
  mint(setup: VoiceTokenSetup): Promise<VoiceTokenMinted>;
}

export interface VoiceTokenDeps {
  readonly tokenPort: RealtimeVoiceTokenPort;
  readonly artisanReader: ArtisanReader;
  readonly statsReader: ConseilsStatsReader;
  readonly threadWriter: AssistantThreadWriter;
  readonly threadsRepo: IAssistantThreadsRepository;
  readonly tools: readonly ToolSchema[];
}
export interface VoiceTokenInput {
  readonly threadId?: number;
  readonly pageContext?: string;
}
export interface VoiceTokenOutput extends VoiceTokenMinted {
  readonly threadId?: number;
}

const HISTORY_LIMIT = 20;

export async function mintVoiceToken(deps: VoiceTokenDeps, ctx: TenantContext, input: VoiceTokenInput): Promise<VoiceTokenOutput> {
  // Thread (best-effort) : permet de persister les tours vocaux (browser↔Gemini ne touche pas le serveur).
  let threadId = input.threadId ?? 0;
  if (!threadId) {
    try {
      threadId = await deps.threadWriter.createThread(ctx, "Conversation vocale");
    } catch {
      threadId = 0;
    }
  }

  const artisan = await deps.artisanReader.getArtisan(ctx);
  const metier = (artisan?.metier as string | null | undefined) || (artisan?.specialite as string | null | undefined) || null;
  let stats = { devisEnCours: 0, facturesImpayeesCount: 0, facturesImpayeesTotal: 0 };
  try {
    const s = await deps.statsReader.getStats(ctx);
    stats = { devisEnCours: s.nbDevisEnAttente, facturesImpayeesCount: s.nbFacturesImpayees, facturesImpayeesTotal: s.montantImpayees };
  } catch {
    /* best-effort */
  }
  const baseSystem = buildAssistantSystemPrompt({ artisanName: artisan?.nomEntreprise ?? null, metier, stats, pageContext: input.pageContext });

  // Historique (best-effort) — ownership du thread vérifié avant de lire ses messages (anti-IDOR).
  let history: { role: string; transcript: string }[] = [];
  if (threadId) {
    try {
      const owned = await deps.threadsRepo.getThreadOwned(ctx, threadId);
      if (owned) history = await deps.threadsRepo.listMessages(ctx, threadId, HISTORY_LIMIT);
    } catch {
      /* history optional */
    }
  }

  const systemText = buildVoiceSystemInstruction({ baseSystem, history, tools: deps.tools });
  const minted = await deps.tokenPort.mint({ systemText, tools: deps.tools });
  return { ...minted, threadId: threadId || undefined };
}
