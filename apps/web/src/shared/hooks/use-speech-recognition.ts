import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechRecognitionResultEvent { resultIndex: number; results: SpeechRecognitionResult[] & { length: number } }
interface SpeechRecognitionErrorEvent { error?: string }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

interface UseSpeechRecognitionOptions {
  /** Locale BCP-47, défaut: fr-FR */
  lang?: string;
  /** Auto-stop après N ms de silence, défaut: 10000 (10 s) */
  silenceMs?: number;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  /** Texte intermédiaire (live) pendant la dictée */
  transcript: string;
  /** Texte final, mis à jour seulement quand la dictée se termine avec un résultat */
  finalTranscript: string;
  /** True si l'API Web Speech est dispo (Chrome, Edge, Safari ; pas Firefox) */
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  /**
   * Ms restantes avant l'arrêt automatique pour cause de silence. Null quand
   * pas en écoute. Sert à afficher un countdown ou une barre de progression.
   */
  silenceCountdownMs: number | null;
  /** Configuration du seuil de silence (ms). Utile pour calculer une progression. */
  silenceMaxMs: number;
}

const DEFAULT_SILENCE_MS = 10_000;
const TICK_INTERVAL_MS = 100;

/**
 * Wrapper React de la Web Speech API (SpeechRecognition).
 * Zéro dépendance, fonctionne en Chrome, Edge, Safari (desktop + mobile).
 * Expose un countdown ms pour permettre à l'UI d'afficher une barre de
 * progression qui se remplit pendant le silence et se recharge dès qu'un
 * nouveau résultat arrive.
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const { lang = "fr-FR", silenceMs = DEFAULT_SILENCE_MS } = options;

  const SpeechRecognitionCtor: (new () => SpeechRecognitionLike) | undefined =
    typeof window !== "undefined"
      ? (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
      : undefined;

  const isSupported = !!SpeechRecognitionCtor;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [silenceCountdownMs, setSilenceCountdownMs] = useState<number | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceArmedAtRef = useRef<number>(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualStopRef = useRef(false);

  const stopTicking = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    setSilenceCountdownMs(null);
  }, []);

  const startTicking = useCallback(() => {
    if (tickIntervalRef.current) return;
    tickIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - silenceArmedAtRef.current;
      const remaining = Math.max(0, silenceMs - elapsed);
      setSilenceCountdownMs(remaining);
    }, TICK_INTERVAL_MS);
  }, [silenceMs]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceArmedAtRef.current = Date.now();
    setSilenceCountdownMs(silenceMs);
    silenceTimerRef.current = setTimeout(() => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
    }, silenceMs);
    startTicking();
  }, [silenceMs, clearSilenceTimer, startTicking]);

  const startListening = useCallback(() => {
    if (!isSupported || isListening) return;
    setError(null);
    setTranscript("");
    setFinalTranscript("");
    manualStopRef.current = false;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      armSilenceTimer();
    };

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0]?.transcript || "";
        if (r.isFinal) final += text;
        else interim += text;
      }
      /** Cumulative transcript (interim + finalized so far) */
      const combined = (final + interim).trim();
      setTranscript(combined);
      if (final) {
        setFinalTranscript((prev) => (prev + final).trim());
      }
      /** L'artisan parle → on relance le compteur de silence. */
      armSilenceTimer();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = event?.error || "unknown";
      let msg = "Erreur de reconnaissance vocale";
      if (code === "not-allowed" || code === "service-not-allowed") {
        msg = "Permission micro refusée. Active-la dans les réglages du navigateur.";
      } else if (code === "no-speech") {
        msg = "Aucune voix détectée. Réessaie en parlant plus fort.";
      } else if (code === "audio-capture") {
        msg = "Aucun micro disponible.";
      } else if (code === "network") {
        msg = "Erreur réseau (la reconnaissance vocale nécessite Internet).";
      } else if (code === "aborted") {
        /** arrêt manuel, pas une erreur user-facing */
        msg = "";
      }
      if (msg) setError(msg);
    };

    recognition.onend = () => {
      clearSilenceTimer();
      stopTicking();
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : null) || "Impossible de démarrer la dictée");
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [
    SpeechRecognitionCtor,
    isSupported,
    isListening,
    lang,
    armSilenceTimer,
    clearSilenceTimer,
    stopTicking,
  ]);

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    clearSilenceTimer();
    stopTicking();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
  }, [clearSilenceTimer, stopTicking]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setFinalTranscript("");
  }, []);

  /** Cleanup on unmount */
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      stopTicking();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
  }, [clearSilenceTimer, stopTicking]);

  return {
    isListening,
    transcript,
    finalTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    silenceCountdownMs,
    silenceMaxMs: silenceMs,
  };
}
