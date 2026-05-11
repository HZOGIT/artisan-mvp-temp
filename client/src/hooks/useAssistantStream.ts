import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type Message = { role: "user" | "assistant"; content: string };

interface UseAssistantStreamOptions {
  /** Texte injecté dans le system prompt côté serveur pour situer l'IA */
  pageContext?: string;
}

interface UseAssistantStreamReturn {
  messages: Message[];
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  abort: () => void;
}

/**
 * Encapsule la conversation streaming avec MonAssistant via /api/assistant/stream.
 *
 * - L'historique (≤10 derniers messages) part avec chaque requête.
 * - pageContext est lu dynamiquement à chaque envoi via une ref (pas de recréation
 *   du callback à chaque changement de route).
 * - Le message assistant est ajouté à la liste seulement quand le premier chunk
 *   arrive, pour qu'AIChatBox affiche son spinner de chargement entre-temps.
 */
export function useAssistantStream(
  options: UseAssistantStreamOptions = {}
): UseAssistantStreamReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  const pageContextRef = useRef<string | undefined>(options.pageContext);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    pageContextRef.current = options.pageContext;
  }, [options.pageContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || abortRef.current) return;

    const history = messagesRef.current.slice(-10);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let assistantAdded = false;
    const appendChunk = (chunk: string) => {
      setMessages((prev) => {
        if (!assistantAdded) {
          assistantAdded = true;
          return [...prev, { role: "assistant", content: chunk }];
        }
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
        }
        return updated;
      });
    };

    try {
      const response = await fetch("/api/assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: trimmed,
          history: history.map((m) => ({ role: m.role, content: m.content })),
          pageContext: pageContextRef.current,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(err.error || "Erreur serveur");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Pas de stream disponible");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) appendChunk(parsed.content);
            if (parsed.error) toast.error(parsed.error);
          } catch {
            // chunk de pré-flush, ignore
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") return;
      toast.error(error.message || "Erreur de connexion");
      // Si on a déjà commencé à streamer, on garde le message partiel.
      // Sinon, rien à nettoyer (assistantAdded est false).
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setIsStreaming(false);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, sendMessage, clearMessages, abort };
}
