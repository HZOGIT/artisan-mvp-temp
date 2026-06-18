import type { RealtimeVoiceTokenPort, VoiceTokenMinted, VoiceTokenSetup } from "../application/voice-token-use-cases";

// Fake du provider de mint vocal : capture le setup reçu (system + tools) et renvoie un token fixe. Permet
// de tester l'orchestration `mintVoiceToken` (thread, system instruction, outils) sans appel réseau.
export class FakeRealtimeVoiceTokenPort implements RealtimeVoiceTokenPort {
  public lastSetup?: VoiceTokenSetup;
  constructor(private readonly minted: VoiceTokenMinted = { token: "tok-123", wsUrl: "wss://live.example/ws", model: "gemini-live", expiresAt: "2026-06-15T01:00:00.000Z" }) {}

  async mint(setup: VoiceTokenSetup): Promise<VoiceTokenMinted> {
    this.lastSetup = setup;
    return this.minted;
  }
}
