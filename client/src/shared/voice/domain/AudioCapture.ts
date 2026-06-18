// Port — no Web Audio API types here.
export interface AudioCaptureConfig {
  sampleRate: 16000;
  channelCount: 1;
  onChunk: (pcm16Base64: string) => void;
  onError: (error: Error) => void;
}

export interface AudioCapture {
  start(config: AudioCaptureConfig): Promise<void>;
  stop(): void;
  readonly isActive: boolean;
}
