// AudioWorklet processor — PCM16 playback queue.
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._queue = new Int16Array(0);
    this._playing = false;
    this.port.onmessage = (e) => {
      if (e.data.type === 'chunk') {
        const incoming = new Int16Array(e.data.buffer);
        const merged = new Int16Array(this._queue.length + incoming.length);
        merged.set(this._queue);
        merged.set(incoming, this._queue.length);
        this._queue = merged;
        this._playing = true;
      } else if (e.data.type === 'clear') {
        this._queue = new Int16Array(0);
        this._playing = false;
      }
    };
  }

  process(_, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const channel = output[0];

    if (this._queue.length === 0) {
      channel.fill(0);
      if (this._playing) {
        this._playing = false;
        this.port.postMessage({ type: 'ended' });
      }
      return true;
    }

    const toRead = Math.min(channel.length, this._queue.length);
    for (let i = 0; i < toRead; i++) {
      channel[i] = this._queue[i] / 0x7fff;
    }
    for (let i = toRead; i < channel.length; i++) channel[i] = 0;
    this._queue = this._queue.slice(toRead);
    return true;
  }
}

registerProcessor('playback-processor', PlaybackProcessor);
