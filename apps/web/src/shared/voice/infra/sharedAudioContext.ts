/*
 * A SINGLE AudioContext shared by capture and playback.
 * 
 * Why: creating two AudioContexts at different sample rates (e.g. 48 kHz mic
 * capture + 24 kHz playback) forces the OS audio device to reconfigure, which
 * suspends the capture context — its worklet then stops after one render
 * quantum and no mic audio is ever sent. Sharing one native-rate context
 * avoids the conflict entirely.
 */
let _ctx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    /** native rate (typically 48000) — do NOT force a rate */
    _ctx = new AudioContext();
  }
  return _ctx;
}

export async function resumeSharedAudioContext(): Promise<AudioContext> {
  const ctx = getSharedAudioContext();
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* ignore */ }
  }
  return ctx;
}

export function closeSharedAudioContext(): void {
  if (_ctx && _ctx.state !== 'closed') {
    _ctx.close().catch(() => {});
  }
  _ctx = null;
}
