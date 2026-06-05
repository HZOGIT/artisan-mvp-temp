// Port — no Web Audio API types here.
export interface AudioOutput {
  enqueue(pcm16Base64: string, sampleRate: 24000): void;
  stop(): void;
  clear(): void;
  readonly isPlaying: boolean;
}
