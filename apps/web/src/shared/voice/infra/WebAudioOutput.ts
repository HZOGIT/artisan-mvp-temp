import type { AudioOutput } from '@/shared/voice/domain/AudioOutput';
import { resumeSharedAudioContext } from './sharedAudioContext';

/** native-audio Live models output 24 kHz PCM16 */
const MODEL_RATE = 24000;

export class WebAudioOutput implements AudioOutput {
  private _ctx: AudioContext | null = null;
  private _node: AudioWorkletNode | null = null;
  private _playing = false;
  private _ready: Promise<void> | null = null;
  /** 24 kHz Int16 chunks that arrive before the worklet node is wired up. */
  private _pending: Int16Array[] = [];

  get isPlaying() { return this._playing; }

  /**
   * Initialise playback on the SHARED native-rate context (same one capture
   * uses). Reachable from the click / after getUserMedia, so resuming is
   * allowed and the assistant's voice is actually audible.
   */
  async resume(): Promise<void> {
    if (!this._ready) this._ready = this._init();
    await this._ready;
    if (this._ctx && this._ctx.state === 'suspended') {
      try { await this._ctx.resume(); } catch { /* ignore */ }
    }
  }

  private async _init(): Promise<void> {
    this._ctx = await resumeSharedAudioContext();
    await this._ctx.audioWorklet.addModule(`/worklets/playback-processor.js?v=${Date.now()}`);
    this._node = new AudioWorkletNode(this._ctx, 'playback-processor');
    this._node.connect(this._ctx.destination);
    this._node.port.onmessage = (e) => {
      if (e.data.type === 'ended') this._playing = false;
    };
    if (this._pending.length && this._node) {
      for (const s of this._pending) this._pushSamples(s);
      this._pending = [];
      this._playing = true;
    }
  }

  /*
   * Resample 24 kHz model audio → the shared context's native rate, then hand
   * the Int16 samples to the playback worklet (which plays 1:1 at ctx rate).
   */
  private _pushSamples(src24k: Int16Array): void {
    if (!this._node || !this._ctx) return;
    const outRate = this._ctx.sampleRate;
    let out: Int16Array;
    if (outRate === MODEL_RATE) {
      out = src24k;
    } else {
      /** e.g. 24000/48000 = 0.5 */
      const ratio = MODEL_RATE / outRate;
      const outLen = Math.floor(src24k.length / ratio);
      out = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const frac = pos - i0;
        const a = src24k[i0] || 0;
        const b = src24k[i0 + 1] !== undefined ? src24k[i0 + 1] : a;
        out[i] = (a + (b - a) * frac) | 0;
      }
    }
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    this._node.port.postMessage({ type: 'chunk', buffer: buf }, [buf]);
  }

  enqueue(pcm16Base64: string, _sampleRate: 24000): void {
    const binary = atob(pcm16Base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    /** base64 byte length is always even for PCM16; build a copy-safe Int16Array. */
    const src = new Int16Array(bytes.buffer, 0, bytes.length >> 1);

    if (this._node && this._ctx) {
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      this._pushSamples(src);
      this._playing = true;
      return;
    }

    /** Not ready yet — buffer a copy and kick off init (which flushes _pending). */
    this._pending.push(new Int16Array(src));
    this._playing = true;
    void this.resume();
  }

  stop(): void {
    this._node?.disconnect();
    /** Do NOT close the shared context here — the session owns its lifecycle. */
    this._ctx = null;
    this._node = null;
    this._ready = null;
    this._pending = [];
    this._playing = false;
  }

  clear(): void {
    this._pending = [];
    this._node?.port.postMessage({ type: 'clear' });
    this._playing = false;
  }
}
