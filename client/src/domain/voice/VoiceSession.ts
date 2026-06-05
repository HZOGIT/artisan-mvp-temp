// Pure domain port — zero Web/DOM/WebSocket imports.
// Web adapter: infra-web/GeminiLiveVoiceSession.ts
// RN adapter (v2): infra-native/NativeVoiceSession.ts

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceSessionEvents {
  onStateChange: (state: VoiceState) => void;
  onUserTranscript: (text: string, isFinal: boolean) => void;
  onAssistantDelta: (delta: string) => void;
  onTurnComplete: (userTranscript: string, assistantTranscript: string, metadata?: any) => void;
  onInterrupted: () => void;
  onError: (error: Error) => void;
}

export interface VoiceSessionConfig {
  token: string;
  wsUrl: string;
  events: VoiceSessionEvents;
}

export interface VoiceSession {
  start(config: VoiceSessionConfig): Promise<void>;
  stop(): Promise<void>;
  interrupt(): void;
  readonly state: VoiceState;
}
