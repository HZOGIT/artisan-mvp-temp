import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { VoiceState } from '@/shared/voice/domain/voice-session';
import { GeminiLiveVoiceSession } from '@/shared/voice/infra/gemini-live-voice-session';
import { vlog } from '@/shared/voice/infra/voice-debug';
import { BACKEND_URL } from '@/shared/backend-url';

export interface UseVoiceSessionOptions {
  threadId?: number;
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  onAssistantDelta?: (delta: string) => void;
  onTurnComplete?: (user: string, assistant: string, metadata?: any) => void;
  /** Called with the thread id the voice session uses (created if needed). */
  onThreadId?: (threadId: number) => void;
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
  /** The thread voice turns are persisted to (created by /voice/token if absent). */
  const threadIdRef = useRef<number | undefined>(options.threadId);
  const queryClient = useQueryClient();

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

      /** Fetch ephemeral token from server */
      const res = await fetch(`${BACKEND_URL}/api/voice/token`, {
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

      const { token, wsUrl, model, threadId } = await res.json();
      vlog(`token received (model=${model}, threadId=${threadId}) — opening Live WS`);

      /*
       * Adopt the thread id (created server-side if we started without one) so
       * voice turns persist and text/voice share the same conversation.
       */
      if (threadId) {
        threadIdRef.current = Number(threadId);
        options.onThreadId?.(Number(threadId));
      }

      const session = new GeminiLiveVoiceSession();
      sessionRef.current = session;

      await session.start({
        token,
        wsUrl,
        events: {
          onStateChange: (s) => { vlog(`state → ${s}`); setVoiceState(s); },
          onUserTranscript: (t, f) => { vlog(`USER transcript: "${t}"`); (options.onUserTranscript || (() => {}))(t, f); },
          onAssistantDelta: options.onAssistantDelta || (() => {}),
          onTurnComplete: (u, a, m) => {
            vlog(`turnComplete user="${u}" assistant="${a}"`);
            /** Persist this voice turn — the Live session never touches our server. */
            const tid = threadIdRef.current;
            if (tid && ((u && u.trim()) || (a && a.trim()))) {
              fetch(`${BACKEND_URL}/api/voice/persist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ threadId: tid, userTranscript: u, assistantTranscript: a, usageMetadata: m }),
                keepalive: true,
              }).then(r => vlog(`/voice/persist → ${r.status}`)).catch(e => vlog(`persist failed: ${e?.message}`));
            }
            (options.onTurnComplete || (() => {}))(u, a, m);
          },
          onInterrupted: () => { vlog('interrupted (barge-in)'); },
          onError: (err) => {
            vlog(`❌ session error: ${err.message}`);
            setError(err.message);
            setVoiceState('error');
          },
          onToolCallDone: () => {
            for (const key of ['devis', 'factures', 'clients', 'stocks', 'commandes', 'notifications']) {
              queryClient.invalidateQueries({ queryKey: [key] });
            }
          },
        },
      });
    } catch (err: any) {
      vlog(`❌ startVoice catch: ${err?.message}`);
      setError(err.message || 'Erreur vocale');
      setVoiceState('error');
    }
  }, [options.threadId, options.onUserTranscript, options.onAssistantDelta, options.onTurnComplete, options.onThreadId, stopVoice]);

  /*
   * Keep the persist target in sync if the thread id changes elsewhere (e.g. a
   * text message created the thread before voice started).
   */
  useEffect(() => {
    if (options.threadId) threadIdRef.current = options.threadId;
  }, [options.threadId]);

  const toggleVoice = useCallback(async () => {
    if (voiceState === 'idle' || voiceState === 'error') {
      await startVoice();
    } else {
      await stopVoice();
    }
  }, [voiceState, startVoice, stopVoice]);

  /** Cleanup on unmount */
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
