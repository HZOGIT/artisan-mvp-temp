import type { AudioCapture, AudioCaptureConfig } from '@/domain/voice/AudioCapture';
import { vlog } from './voiceDebug';
import { resumeSharedAudioContext } from './sharedAudioContext';

export class WebAudioCapture implements AudioCapture {
  private _ctx: AudioContext | null = null;
  private _stream: MediaStream | null = null;
  private _node: AudioWorkletNode | null = null;
  private _source: MediaStreamAudioSourceNode | null = null;
  private _active = false;

  get isActive() { return this._active; }

  async start(config: AudioCaptureConfig): Promise<void> {
    vlog('capture.start() requesting getUserMedia…');
    try {
      // NOTE: do NOT constrain sampleRate — forcing it (and forcing the context
      // to 16k) makes Chromium's MediaStreamSource emit nothing. We capture at
      // native rate and downsample to 16k inside the worklet.
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (e: any) {
      vlog(`❌ getUserMedia FAILED: ${e?.name} ${e?.message}`);
      throw e;
    }

    const track = this._stream.getAudioTracks()[0];
    const settings = (track?.getSettings?.() || {}) as any;
    vlog(`getUserMedia OK — mic="${track?.label || '?'}" enabled=${track?.enabled} muted=${track?.muted} readyState=${track?.readyState} settings.sampleRate=${settings.sampleRate} channelCount=${settings.channelCount}`);

    // Use the SHARED native-rate context (same one playback uses) so we never
    // open a second context at a different rate — which would suspend this one.
    this._ctx = await resumeSharedAudioContext();
    vlog(`shared AudioContext state=${this._ctx.state} sampleRate=${this._ctx.sampleRate} (native, shared)`);

    try {
      // Cache-bust: worklet JS is cached very aggressively; force a fresh fetch.
      await this._ctx.audioWorklet.addModule(`/worklets/capture-processor.js?v=${Date.now()}`);
      vlog('capture worklet module loaded');
    } catch (e: any) {
      vlog(`❌ addModule(capture-processor) FAILED: ${e?.message}`);
      throw e;
    }

    this._node = new AudioWorkletNode(this._ctx, 'capture-processor', {
      processorOptions: { inputSampleRate: this._ctx.sampleRate },
    });

    this._node.port.onmessage = (e) => {
      if (e.data.pcm) {
        // Encode raw PCM16 → base64 here (btoa exists on the main thread, not
        // in the AudioWorkletGlobalScope).
        const bytes = new Uint8Array(e.data.pcm as ArrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        config.onChunk(btoa(binary));
      } else if (e.data.debug) {
        vlog(`[worklet] ${e.data.debug}`);
      }
    };

    this._node.port.onmessageerror = (e) => { vlog('worklet messageerror'); config.onError(new Error(String(e))); };

    this._source = this._ctx.createMediaStreamSource(this._stream);
    this._source.connect(this._node);
    this._node.connect(this._ctx.destination); // needed for worklet to run
    this._active = true;
    vlog(`capture wired up — ctx.state=${this._ctx.state}. If no "sent chunk" lines follow, the worklet isn't running.`);

    // Belt-and-suspenders: some browsers re-suspend; resume again post-wiring.
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().then(() => vlog(`capture ctx resumed late → ${this._ctx?.state}`)).catch(() => {});
    }
  }

  stop(): void {
    this._active = false;
    this._source?.disconnect();
    this._node?.disconnect();
    this._stream?.getTracks().forEach(t => t.stop());
    // Do NOT close the context — it is shared with playback. The session closes
    // it via closeSharedAudioContext() when the whole voice session ends.
    this._ctx = null;
    this._stream = null;
    this._node = null;
    this._source = null;
  }
}
