import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceState } from '@/domain/voice/VoiceSession';
import { GeminiLiveVoiceSession } from '@/infra-web/GeminiLiveVoiceSession';
import { vlog } from '@/infra-web/voiceDebug';

export interface UseVoiceSessionOptions {
  threadId?: number;
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  onAssistantDelta?: (delta: string) => void;
  onTurnComplete?: (user: string, assistant: string, metadata?: any) => void;
}

export interface UseVoiceSessionReturn {
  voiceState: VoiceState;
  isVoiceActive: boolean;
  startVoice: () => Promise<void>;
  stopVoice: () => Promise<void>;
  toggleVoice: () => Promise<void>;
  isMuted: boolean;
  toggleMute: () => void;
  error: string | null;
}

export function useVoiceSession(options: UseVoiceSessionOptions = {}): UseVoiceSessionReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const sessionRef = useRef<GeminiLiveVoiceSession | null>(null);

  const stopVoice = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.stop();
      sessionRef.current = null;
    }
    setIsMuted(false);
    setVoiceState('idle');
  }, []);

  const toggleMute = useCallback(() => {
    const next = !sessionRef.current?.isMuted;
    sessionRef.current?.setMuted(next);
    setIsMuted(next);
  }, []);

  const startVoice = useCallback(async () => {
    try {
      setError(null);
      await stopVoice();
      vlog(`=== startVoice() clicked, threadId=${options.threadId ?? 'none'} ===`);

      // Fetch ephemeral token from server
      const res = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId: options.threadId }),
      });
      vlog(`/api/voice/token → HTTP ${res.status}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        vlog(`❌ token endpoint error: ${err.error || res.status}`);
        throw new Error(err.error || 'Impossible de démarrer la session vocale');
      }

      const { token, wsUrl, model } = await res.json();
      vlog(`token received (model=${model}) — opening Live WS`);

      const session = new GeminiLiveVoiceSession();
      sessionRef.current = session;

      await session.start({
        token,
        wsUrl,
        events: {
          onStateChange: (s) => { vlog(`state → ${s}`); setVoiceState(s); },
          onUserTranscript: (t, f) => { vlog(`USER transcript: "${t}"`); (options.onUserTranscript || (() => {}))(t, f); },
          onAssistantDelta: options.onAssistantDelta || (() => {}),
          onTurnComplete: (u, a, m) => { vlog(`turnComplete user="${u}" assistant="${a}"`); (options.onTurnComplete || (() => {}))(u, a, m); },
          onInterrupted: () => { vlog('interrupted (barge-in)'); },
          onError: (err) => {
            vlog(`❌ session error: ${err.message}`);
            setError(err.message);
            setVoiceState('error');
          },
        },
      });
    } catch (err: any) {
      vlog(`❌ startVoice catch: ${err?.message}`);
      setError(err.message || 'Erreur vocale');
      setVoiceState('error');
    }
  }, [options.threadId, options.onUserTranscript, options.onAssistantDelta, options.onTurnComplete, stopVoice]);

  const toggleVoice = useCallback(async () => {
    if (voiceState === 'idle' || voiceState === 'error') {
      await startVoice();
    } else {
      await stopVoice();
    }
  }, [voiceState, startVoice, stopVoice]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopVoice(); };
  }, [stopVoice]);

  return {
    voiceState,
    isVoiceActive: voiceState !== 'idle' && voiceState !== 'error',
    startVoice,
    stopVoice,
    toggleVoice,
    isMuted,
    toggleMute,
    error,
  };
}
