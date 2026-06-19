import type { VoiceSession, VoiceSessionConfig, VoiceState } from '@/shared/voice/domain/VoiceSession';
import { WebAudioCapture } from './WebAudioCapture';
import { WebAudioOutput } from './WebAudioOutput';
import { vlog } from './voiceDebug';
import { closeSharedAudioContext } from './sharedAudioContext';
import { BACKEND_URL } from '@/shared/backend-url';

export class GeminiLiveVoiceSession implements VoiceSession {
  private _ws: WebSocket | null = null;
  private _capture = new WebAudioCapture();
  private _output = new WebAudioOutput();
  private _state: VoiceState = 'idle';
  private _events: VoiceSessionConfig['events'] | null = null;

  /** Accumulate transcripts for the current turn */
  private _userTranscript = '';
  private _assistantTranscript = '';
  /** Resolves once the server acknowledges our setup message. */
  private _onSetupComplete: (() => void) | null = null;
  private _sentChunks = 0;
  /** AbortController for the currently running tool call — cancelled on barge-in. */
  private _toolAbort: AbortController | null = null;
  /*
   * When muted, we stream clean digital silence instead of the mic — this is a
   * reliable way to force the model's end-of-turn detection so it responds.
   */
  private _muted = false;
  /** 20 ms of PCM16 silence @16k = 320 samples × 2 bytes = 640 zero bytes. */
  private static readonly SILENCE_B64 = btoa('\0'.repeat(640));
  private _recvCount = 0;

  get state() { return this._state; }

  private setState(s: VoiceState) {
    this._state = s;
    this._events?.onStateChange(s);
  }

  async start(config: VoiceSessionConfig): Promise<void> {
    this._events = config.events;
    this.setState('connecting');
    vlog(`start() wsUrl=${config.wsUrl.slice(0, 70)}… tokenLen=${config.token?.length ?? 0}`);

    /*
     * Constrained endpoint with an ephemeral token authenticates via
     * `access_token` (NOT `key`). The token locks the model/config, but the
     * protocol STILL requires `setup` to be the very first message (otherwise
     * the server closes with 1007 "setup must be the first message") — so we
     * send an empty setup and wait for `setupComplete` before streaming audio.
     */
    const url = `${config.wsUrl}?access_token=${encodeURIComponent(config.token)}`;
    this._ws = new WebSocket(url);
    /*
     * Gemini Live sends server messages as BINARY frames. In the browser these
     * arrive as Blob (or ArrayBuffer) — never as string. Without this the
     * message handler dropped every frame, so there was no audio AND no
     * transcription even though the socket connected fine.
     */
    this._ws.binaryType = 'arraybuffer';

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { vlog('❌ WS open timeout'); reject(new Error('WebSocket timeout')); }, 10000);
      this._ws!.onopen = () => { clearTimeout(timeout); vlog('WS open ✓'); resolve(); };
      this._ws!.onerror = () => { clearTimeout(timeout); vlog('❌ WS error during open'); reject(new Error('WebSocket error')); };
    });

    this._ws.onmessage = (e) => { void this._handleMessage(e); };
    this._ws.onclose = (ev) => {
      vlog(`WS closed code=${ev.code} reason="${ev.reason}" (sent=${this._sentChunks} recv=${this._recvCount})`);
      this._capture.stop();
      this._output.stop();
      if (this._state !== 'idle') this.setState('idle');
    };
    this._ws.onerror = () => {
      vlog('❌ WS error (runtime)');
      this._events?.onError(new Error('WebSocket error'));
      this.setState('error');
    };

    /** 1) Send setup first and wait for setupComplete. */
    const setupComplete = new Promise<void>((resolve, reject) => {
      this._onSetupComplete = resolve;
      setTimeout(() => { if (this._onSetupComplete) { vlog('❌ setupComplete timeout (no ack from server)'); reject(new Error('setupComplete timeout')); } }, 10000);
    });
    vlog('→ sending setup {}');
    this._ws.send(JSON.stringify({ setup: {} }));
    await setupComplete;

    this.setState('listening');
    vlog('setupComplete ✓ → state=listening');

    /*
     * 2) Prewarm playback FIRST (loads the playback worklet module + node on the
     * shared context). Doing all addModule() calls before the capture worklet is
     * running avoids any chance of interrupting it mid-stream.
     */
    try { await this._output.resume(); vlog('output prewarmed (before capture)'); } catch (e: any) { vlog(`output prewarm failed: ${e?.message}`); }

    /** 3) Start audio capture — stream PCM chunks to WS */
    vlog('starting mic capture…');
    await this._capture.start({
      sampleRate: 16000,
      channelCount: 1,
      onChunk: (base64) => {
        const open = this._ws?.readyState === WebSocket.OPEN;
        if (open) {
          this._sentChunks++;
          /*
           * When muted, replace the mic chunk with clean digital silence so the
           * model's VAD detects end-of-turn and responds.
           */
          const data = this._muted ? GeminiLiveVoiceSession.SILENCE_B64 : base64;
          if (this._sentChunks <= 3 || this._sentChunks % 50 === 0) {
            const bytes = atob(data);
            let energy = 0;
            for (let i = 0; i + 1 < bytes.length; i += 2) {
              const s = (bytes.charCodeAt(i) | (bytes.charCodeAt(i + 1) << 8)) << 16 >> 16;
              energy += Math.abs(s);
            }
            const avg = Math.round(energy / (bytes.length / 2));
            vlog(`→ sent chunk #${this._sentChunks}${this._muted ? ' [MUTED→silence]' : ''} avgLevel=${avg}${!this._muted && avg < 30 ? ' ⚠️ silence' : ' 🎤'}`);
          }
          this._ws!.send(JSON.stringify({
            realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data } },
          }));
        } else {
          if (this._sentChunks === 0) vlog(`⚠️ got mic chunk but WS not open (state=${this._ws?.readyState})`);
        }
      },
      onError: (err) => {
        vlog(`❌ capture error: ${err?.message || err}`);
        this._events?.onError(err);
        this.setState('error');
      },
    });

    vlog('capture started ✓ (chunks should now flow)');
  }

  private async _handleMessage(e: MessageEvent) {
    let text: string;
    try {
      if (typeof e.data === 'string') {
        text = e.data;
      } else if (e.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(e.data);
      } else if (typeof Blob !== 'undefined' && e.data instanceof Blob) {
        text = await e.data.text();
      } else {
        return;
      }
    } catch { return; }

    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch { return; }
    if (!msg) return;

    /** Setup acknowledged — unblock start() so it can begin streaming audio. */
    if (msg.setupComplete) {
      vlog('← setupComplete');
      this._onSetupComplete?.();
      this._onSetupComplete = null;
      return;
    }

    /** The model wants to call a tool — execute it server-side and reply. */
    if (msg.toolCall) {
      this._toolAbort?.abort();
      this._toolAbort = new AbortController();
      void this._handleToolCall(msg.toolCall, this._toolAbort.signal);
      return;
    }

    /** Gemini cancelled the pending tool call (barge-in mid-execution). */
    if (msg.toolCallCancellation) {
      vlog(`← toolCallCancellation — aborting pending tool`);
      this._toolAbort?.abort();
      this._toolAbort = null;
      return;
    }

    this._recvCount++;
    const topKeys = Object.keys(msg).join(',');
    if (msg.serverContent) {
      const sc = msg.serverContent;
      /*
       * Only log "interesting" messages (transcription / turn events); skip the
       * hundreds of pure-audio modelTurn frames to avoid flooding.
       */
      if (sc.inputTranscription?.text || sc.outputTranscription?.text || sc.interrupted || sc.turnComplete || sc.generationComplete) {
        vlog(`← msg#${this._recvCount}` +
          (sc.inputTranscription?.text ? ` IN="${sc.inputTranscription.text}"` : '') +
          (sc.outputTranscription?.text ? ` OUT="${sc.outputTranscription.text}"` : '') +
          (sc.interrupted ? ' INTERRUPTED' : '') +
          (sc.generationComplete ? ' [generationComplete]' : '') +
          (sc.turnComplete ? ' [turnComplete]' : ''));
      }
    } else {
      vlog(`← msg#${this._recvCount} {${topKeys}}` + (msg.toolCall ? ' (toolCall)' : '') + (msg.goAway ? ' (goAway)' : ''));
    }

    /** Server content (audio + text from assistant) */
    const serverContent = msg.serverContent;
    if (serverContent) {
      const parts = serverContent.modelTurn?.parts || [];
      for (const part of parts) {
        /** Audio output (native-audio models stream PCM @ 24kHz) */
        const mime = part.inlineData?.mimeType || '';
        if (mime.startsWith('audio/pcm') && part.inlineData?.data) {
          this._output.enqueue(part.inlineData.data, 24000);
          if (this._state !== 'speaking') { vlog('🔊 first audio chunk → state=speaking'); this.setState('speaking'); }
        }
        /*
         * NOTE: we intentionally IGNORE part.text here. On native-audio models
         * it carries the model's internal THINKING (often in English) — the
         * user-facing spoken text is delivered via outputTranscription below.
         */
      }

      /** Assistant text comes via outputTranscription when modality = AUDIO */
      const outputTranscript = serverContent.outputTranscription?.text;
      if (outputTranscript) {
        this._assistantTranscript += outputTranscript;
        this._events?.onAssistantDelta(outputTranscript);
      }

      /** User transcript (input transcription of the mic audio) */
      const inputTranscript = serverContent.inputTranscription?.text;
      if (inputTranscript) {
        this._userTranscript += inputTranscript;
        this._events?.onUserTranscript(this._userTranscript, false);
      }

      /** Turn complete */
      if (serverContent.turnComplete) {
        this._events?.onTurnComplete(
          this._userTranscript,
          this._assistantTranscript,
          msg.usageMetadata
        );
        this._userTranscript = '';
        this._assistantTranscript = '';
        this.setState('listening');
      }
    }

    /** Interrupted (barge-in) */
    if (msg.serverContent?.interrupted) {
      this._output.clear();
      this._events?.onInterrupted();
      this.setState('listening');
    }

  }

  /*
   * Execute each requested function on our server (DB-backed) and send the
   * results back to Gemini so it can continue the spoken response.
   */
  private async _handleToolCall(toolCall: any, signal: AbortSignal): Promise<void> {
    const calls: any[] = toolCall?.functionCalls || [];
    if (calls.length === 0) {
      vlog(`🔧 toolCall with empty functionCalls — ignored`);
      return;
    }
    const functionResponses: any[] = [];
    for (const fc of calls) {
      if (signal.aborted) { vlog(`🔧 ${fc.name} skipped (aborted)`); return; }
      vlog(`🔧 toolCall ${fc.name}(${JSON.stringify(fc.args || {})})`);
      let response: any;
      try {
        const r = await fetch(`${BACKEND_URL}/api/voice/tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: fc.name, args: fc.args || {} }),
          signal: AbortSignal.any
            ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
            : signal,
        });
        if (signal.aborted) { vlog(`🔧 ${fc.name} aborted after fetch`); return; }
        const data = await r.json();
        response = data?.result ?? { ok: false, error: 'no result' };
        vlog(`🔧 ${fc.name} → ${JSON.stringify(response).slice(0, 120)}`);
      } catch (e: any) {
        if (signal.aborted) { vlog(`🔧 ${fc.name} aborted`); return; }
        response = { ok: false, error: e?.message || 'tool error' };
        vlog(`🔧 ${fc.name} FAILED: ${e?.message}`);
      }
      functionResponses.push({ id: fc.id, name: fc.name, response });
    }
    if (signal.aborted) { vlog(`🔧 toolResponse skipped (aborted)`); return; }
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
      vlog(`🔧 sent ${functionResponses.length} toolResponse(s)`);
      this._events?.onToolCallDone?.();
    } else {
      vlog(`🔧 toolResponse NOT sent — WS closed (state=${this._ws?.readyState})`);
    }
  }

  interrupt(): void {
    this._output.clear();
    this._events?.onInterrupted();
  }

  /** Mute the mic: stream clean silence to force the model's end-of-turn. */
  setMuted(muted: boolean): void {
    this._muted = muted;
    vlog(`mic ${muted ? 'MUTED (sending silence → provoke response)' : 'UNMUTED (mic live)'}`);
  }

  get isMuted(): boolean { return this._muted; }

  async stop(): Promise<void> {
    this._capture.stop();
    this._output.stop();
    this._ws?.close();
    this._ws = null;
    /** Now that both capture and playback have released the shared context, close it. */
    closeSharedAudioContext();
    this.setState('idle');
  }
}
