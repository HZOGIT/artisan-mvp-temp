import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechRecognitionOptions {
  /** Locale BCP-47, défaut: fr-FR */
  lang?: string;
  /** Auto-stop après N ms de silence, défaut: 2000 */
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
}

/**
 * Wrapper React de la Web Speech API (SpeechRecognition).
 * Zéro dépendance, fonctionne en Chrome, Edge, Safari (desktop + mobile).
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const { lang = "fr-FR", silenceMs = 2000 } = options;

  const SpeechRecognitionCtor =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : undefined;

  const isSupported = !!SpeechRecognitionCtor;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualStopRef = useRef(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
    }, silenceMs);
  }, [silenceMs, clearSilenceTimer]);

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

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0]?.transcript || "";
        if (r.isFinal) final += text;
        else interim += text;
      }
      // Cumulative transcript (interim + finalized so far)
      const combined = (final + interim).trim();
      setTranscript(combined);
      if (final) {
        setFinalTranscript((prev) => (prev + final).trim());
      }
      armSilenceTimer();
    };

    recognition.onerror = (event: any) => {
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
        msg = ""; // arrêt manuel, pas une erreur user-facing
      }
      if (msg) setError(msg);
    };

    recognition.onend = () => {
      clearSilenceTimer();
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e: any) {
      setError(e?.message || "Impossible de démarrer la dictée");
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [SpeechRecognitionCtor, isSupported, isListening, lang, armSilenceTimer, clearSilenceTimer]);

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    clearSilenceTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
  }, [clearSilenceTimer]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setFinalTranscript("");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
  }, [clearSilenceTimer]);

  return {
    isListening,
    transcript,
    finalTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
