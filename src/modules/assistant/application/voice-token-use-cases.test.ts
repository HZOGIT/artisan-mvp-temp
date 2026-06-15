import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import type { ArtisanReader, ArtisanInfo } from "../../../shared/readers/contact-readers";
import type { ConseilsStatsReader } from "../../conseils-ia/application/conseils-stats-reader";
import type { AiThread, AiMessage } from "../domain/assistant";
import { findTool } from "../domain/assistant-tools-catalog";
import { FakeAssistantThreadWriter } from "../infra/assistant-thread-writer-fake";
import { FakeAssistantThreadsRepository } from "../infra/assistant-threads-repository-fake";
import { FakeRealtimeVoiceTokenPort } from "../infra/realtime-voice-token-fake";
import { mintVoiceToken, type VoiceTokenDeps } from "./voice-token-use-cases";

const ctx: TenantContext = { artisanId: 1, userId: 1 };
const artisan: ArtisanInfo = { id: 1, nomEntreprise: "Plomberie X", email: null, metier: "plomberie" };
class FakeArtisan implements ArtisanReader {
  async getArtisan(): Promise<ArtisanInfo | null> {
    return artisan;
  }
}
const stats: ConseilsStatsReader = { getStats: async () => ({ nbDevisEnAttente: 2, nbFacturesImpayees: 1, montantImpayees: 500, nbStocksBas: 0 }) };
const TOOLS = [findTool("lister_factures")!, findTool("creer_client")!];

const thread = (id: number, artisanId: number): AiThread => ({ id, artisanId, mode: "general", parcoursId: null, title: "Voix", lastMessageAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
const message = (id: number, threadId: number, role: string, transcript: string): AiMessage => ({ id, threadId, role, transcript, metadata: null, createdAt: new Date(id), updatedAt: new Date(id) } as AiMessage);

function build(over: { threadsRepo?: FakeAssistantThreadsRepository; writer?: FakeAssistantThreadWriter; tokenPort?: FakeRealtimeVoiceTokenPort } = {}) {
  const writer = over.writer ?? new FakeAssistantThreadWriter();
  const threadsRepo = over.threadsRepo ?? new FakeAssistantThreadsRepository();
  const tokenPort = over.tokenPort ?? new FakeRealtimeVoiceTokenPort();
  const deps: VoiceTokenDeps = { tokenPort, artisanReader: new FakeArtisan(), statsReader: stats, threadWriter: writer, threadsRepo, tools: TOOLS };
  return { writer, threadsRepo, tokenPort, deps };
}

describe("mintVoiceToken", () => {
  it("crée un thread si absent + mint avec systemText (outils déclarés) + renvoie token + threadId", async () => {
    const { deps, tokenPort, writer } = build();
    const out = await mintVoiceToken(deps, ctx, {});
    expect(out.token).toBe("tok-123");
    expect(out.wsUrl).toContain("wss://");
    expect(out.threadId).toBeGreaterThan(0);
    expect(writer.threads).toHaveLength(1); // thread créé
    expect(tokenPort.lastSetup?.tools).toBe(TOOLS);
    expect(tokenPort.lastSetup?.systemText).toContain("OUTILS DISPONIBLES");
    expect(tokenPort.lastSetup?.systemText).toContain("MonAssistant"); // prompt métier de base
  });

  it("réutilise le threadId fourni + injecte l'historique du thread possédé", async () => {
    const threadsRepo = new FakeAssistantThreadsRepository();
    threadsRepo.seedThread(thread(42, 1));
    threadsRepo.seedMessage(message(1, 42, "user", "Crée un devis"));
    threadsRepo.seedMessage(message(2, 42, "assistant", "C'est fait"));
    const { deps, tokenPort, writer } = build({ threadsRepo });
    const out = await mintVoiceToken(deps, ctx, { threadId: 42 });
    expect(out.threadId).toBe(42);
    expect(writer.threads).toHaveLength(0); // aucun thread créé
    expect(tokenPort.lastSetup?.systemText).toContain("Historique récent");
    expect(tokenPort.lastSetup?.systemText).toContain("Artisan: Crée un devis");
    expect(tokenPort.lastSetup?.systemText).toContain("Assistant: C'est fait");
  });

  it("thread d'un autre tenant → pas d'historique injecté (anti-IDOR)", async () => {
    const threadsRepo = new FakeAssistantThreadsRepository();
    threadsRepo.seedThread(thread(42, 999)); // appartient à un autre artisan
    threadsRepo.seedMessage(message(1, 42, "user", "secret"));
    const { deps, tokenPort } = build({ threadsRepo });
    await mintVoiceToken(deps, ctx, { threadId: 42 });
    expect(tokenPort.lastSetup?.systemText).not.toContain("Historique récent");
    expect(tokenPort.lastSetup?.systemText).not.toContain("secret");
  });
});
