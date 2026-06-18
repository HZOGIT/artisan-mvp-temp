// AudioWorklet processor — runs in the audio thread, no DOM access.
//
// Captures mic audio at the context's NATIVE sample rate (e.g. 48000) and
// downsamples to 16000 Hz PCM16, emitted as base64 in ~20 ms chunks.
//
// Why native rate: forcing `new AudioContext({ sampleRate: 16000 })` makes
// Chromium's MediaStreamAudioSourceNode emit nothing when the mic is 48 kHz —
// the worklet then sees empty input and never produces a chunk (sent=0). So we
// run the context natively and resample here instead.
const TARGET_RATE = 16000;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // `sampleRate` is a global available in the AudioWorkletGlobalScope — it is
    // the actual context rate (the true input rate).
    this._inRate = (options && options.processorOptions && options.processorOptions.inputSampleRate) || sampleRate;
    this._ratio = this._inRate / TARGET_RATE; // e.g. 48000/16000 = 3
    this._readPos = 0;                          // fractional read cursor (input samples)
    this._inBuf = new Float32Array(0);          // pending input samples
    this._outChunk = Math.floor(TARGET_RATE * 0.02); // 320 samples = 20 ms @16k
    this._outBuf = [];                          // accumulated output (16k) samples
    this._calls = 0;
    this.port.postMessage({ debug: `worklet constructed inRate=${this._inRate} ratio=${this._ratio}` });
  }

  process(inputs) {
    this._calls++;
    const input = inputs[0];
    // Diagnostics: report what process() actually sees. Logging calls 1-5 plus
    // milestones tells us whether process() keeps running or dies after #1.
    if (this._calls <= 5 || this._calls === 50 || this._calls === 200 || this._calls === 800) {
      const ch = input && input[0];
      let energy = 0;
      if (ch) { for (let i = 0; i < ch.length; i++) energy += Math.abs(ch[i]); }
      this.port.postMessage({
        debug: `process#${this._calls} chans=${input ? input.length : 'none'} ` +
          `len=${ch ? ch.length : 0} energy=${ch ? (energy / ch.length).toFixed(5) : 'n/a'}`,
      });
    }
    if (!input || !input[0]) return true;
    const channel = input[0]; // Float32Array, 128 samples at input rate

    try {

    // Append new input to the pending buffer.
    const merged = new Float32Array(this._inBuf.length + channel.length);
    merged.set(this._inBuf);
    merged.set(channel, this._inBuf.length);
    this._inBuf = merged;

    // Resample (linear interp) from inputRate → 16k.
    while (this._readPos + 1 < this._inBuf.length) {
      const i0 = Math.floor(this._readPos);
      const frac = this._readPos - i0;
      const s = this._inBuf[i0] * (1 - frac) + this._inBuf[i0 + 1] * frac;
      this._outBuf.push(s);
      this._readPos += this._ratio;
    }

    // Drop consumed input, keep the tail (and rebase the cursor).
    const consumed = Math.floor(this._readPos);
    if (consumed > 0) {
      this._inBuf = this._inBuf.slice(consumed);
      this._readPos -= consumed;
    }

    // Emit full 20 ms PCM16 chunks. IMPORTANT: btoa/atob do NOT exist in the
    // AudioWorkletGlobalScope — so we transfer the raw PCM16 buffer to the main
    // thread and base64-encode it there.
    while (this._outBuf.length >= this._outChunk) {
      const slice = this._outBuf.splice(0, this._outChunk);
      const pcm16 = new Int16Array(this._outChunk);
      for (let i = 0; i < this._outChunk; i++) {
        const v = Math.max(-1, Math.min(1, slice[i]));
        pcm16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      this.port.postMessage({ pcm: pcm16.buffer }, [pcm16.buffer]);
    }
    } catch (err) {
      this.port.postMessage({ debug: `PROCESS THREW @#${this._calls}: ${err && err.message}` });
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
