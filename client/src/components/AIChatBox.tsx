import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Sparkles, Mic, MicOff } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { toast } from "sonner";

/**
 * Message type matching server-side LLM Message interface
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat.
   * Should match the format used by invokeLLM on the server.
   */
  messages: Message[];

  /**
   * Callback when user sends a message.
   * Typically you'll call a tRPC mutation here to invoke the LLM.
   */
  onSendMessage: (content: string) => void;

  /**
   * Whether the AI is currently generating a response
   */
  isLoading?: boolean;

  /**
   * Placeholder text for the input field
   */
  placeholder?: string;

  /**
   * Custom className for the container
   */
  className?: string;

  /**
   * Height of the chat box (default: 600px)
   */
  height?: string | number;

  /**
   * Empty state message to display when no messages
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts to display in empty state
   * Click to send directly
   */
  suggestedPrompts?: string[];

  /**
   * Active le bouton micro de dictée vocale dans la zone de saisie.
   * Utilise la Web Speech API native (Chrome, Edge, Safari ; pas Firefox).
   */
  enableVoice?: boolean;

  /**
   * Locale BCP-47 pour la reconnaissance vocale (ex: "fr-FR", "ar-MA", "tr-TR").
   * Défaut: "fr-FR". Ignoré si enableVoice est false.
   */
  voiceLang?: string;

  /**
   * Si true (défaut), démarre un countdown 5 s après la fin de la dictée pour
   * envoyer automatiquement. Si false, le texte reste dans l'input et
   * l'artisan doit cliquer Envoyer (ou Entrée) pour le transmettre.
   */
  autoSend?: boolean;
};

/**
 * A ready-to-use AI chat box component that integrates with the LLM system.
 *
 * Features:
 * - Matches server-side Message interface for seamless integration
 * - Markdown rendering with Streamdown
 * - Auto-scrolls to latest message
 * - Loading states
 * - Uses global theme colors from index.css
 *
 * @example
 * ```tsx
 * const ChatPage = () => {
 *   const [messages, setMessages] = useState<Message[]>([
 *     { role: "system", content: "You are a helpful assistant." }
 *   ]);
 *
 *   const chatMutation = trpc.ai.chat.useMutation({
 *     onSuccess: (response) => {
 *       // Assuming your tRPC endpoint returns the AI response as a string
 *       setMessages(prev => [...prev, {
 *         role: "assistant",
 *         content: response
 *       }]);
 *     },
 *     onError: (error) => {
 *       console.error("Chat error:", error);
 *       // Optionally show error message to user
 *     }
 *   });
 *
 *   const handleSend = (content: string) => {
 *     const newMessages = [...messages, { role: "user", content }];
 *     setMessages(newMessages);
 *     chatMutation.mutate({ messages: newMessages });
 *   };
 *
 *   return (
 *     <AIChatBox
 *       messages={messages}
 *       onSendMessage={handleSend}
 *       isLoading={chatMutation.isPending}
 *       suggestedPrompts={[
 *         "Explain quantum computing",
 *         "Write a hello world in Python"
 *       ]}
 *     />
 *   );
 * };
 * ```
 */
const AUTO_SEND_COUNTDOWN_SECONDS = 5;

export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Start a conversation with AI",
  suggestedPrompts,
  enableVoice = false,
  voiceLang,
  autoSend = true,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Dictée vocale (Web Speech API) ────────────────────────────────────────
  const speech = useSpeechRecognition({ lang: voiceLang });
  const userEditedRef = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Pendant l'écoute : afficher le transcript live dans l'input
  useEffect(() => {
    if (speech.isListening) {
      userEditedRef.current = false;
      setInput(speech.transcript);
    }
  }, [speech.isListening, speech.transcript]);

  // À la fin de l'écoute : démarrer un compte à rebours de 5 s avant l'envoi
  // auto. Si autoSend est désactivé, on remplit juste l'input et on attend que
  // l'artisan valide manuellement (Entrée ou bouton Envoyer).
  useEffect(() => {
    if (
      !speech.isListening &&
      speech.finalTranscript &&
      !userEditedRef.current &&
      countdown === null
    ) {
      setInput(speech.finalTranscript);
      if (autoSend) {
        setCountdown(AUTO_SEND_COUNTDOWN_SECONDS);
      }
    }
  }, [speech.isListening, speech.finalTranscript, countdown, autoSend]);

  // Tick du compte à rebours, envoi au passage à 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const text = speech.finalTranscript.trim();
      if (text && !userEditedRef.current) {
        onSendMessage(text);
        setInput("");
        speech.resetTranscript();
      }
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, onSendMessage, speech]);

  useEffect(() => {
    if (speech.error) toast.error(speech.error);
  }, [speech.error]);

  const cancelAutoSend = () => {
    setCountdown(null);
    speech.resetTranscript();
    setInput("");
  };

  /**
   * Envoi immédiat — disponible pendant la dictée OU pendant le countdown.
   * Stoppe la reco si elle tourne, prend le meilleur texte disponible
   * (transcript live > finalTranscript > input actuel) et le transmet.
   */
  const sendNow = () => {
    const candidate =
      (speech.transcript || speech.finalTranscript || input || "").trim();
    if (!candidate || isLoading) return;
    if (speech.isListening) {
      speech.stopListening();
    }
    setCountdown(null);
    speech.resetTranscript();
    setInput("");
    onSendMessage(candidate);
    scrollToBottom();
    textareaRef.current?.focus();
  };

  const handleMicClick = () => {
    // Reclic pendant le compte à rebours : annule l'envoi auto et relance l'écoute
    if (countdown !== null) {
      setCountdown(null);
      speech.resetTranscript();
      setInput("");
      speech.startListening();
      return;
    }
    if (!speech.isSupported) {
      toast.info(
        "Dictée vocale non disponible sur ce navigateur. Utilise Chrome, Edge ou Safari."
      );
      return;
    }
    if (speech.isListening) {
      speech.stopListening();
    } else {
      speech.startListening();
    }
  };

  // Filter out system messages
  const displayMessages = messages.filter((msg) => msg.role !== "system");

  // Calculate min-height for last assistant message to push user message to top
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;

      // Reserve space for:
      // - padding (p-4 = 32px top+bottom)
      // - user message: 40px (item height) + 16px (margin-top from space-y-4) = 56px
      // Note: margin-bottom is not counted because it naturally pushes the assistant message down
      const userMessageReservedHeight = 56;
      const calculatedHeight = scrollAreaHeight - 32 - userMessageReservedHeight;

      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  // Scroll to bottom helper function with smooth animation
  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement;

    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth'
        });
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    // Annule un compte à rebours d'envoi vocal en attente
    if (countdown !== null) setCountdown(null);
    speech.resetTranscript();

    onSendMessage(trimmedInput);
    setInput("");

    // Scroll immediately after sending
    scrollToBottom();

    // Keep focus on input
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm",
        className
      )}
      style={{ height }}
    >
      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-4">
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <Sparkles className="size-12 opacity-20" />
                <p className="text-sm">{emptyStateMessage}</p>
              </div>

              {suggestedPrompts && suggestedPrompts.length > 0 && (
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => onSendMessage(prompt)}
                      disabled={isLoading}
                      className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((message, index) => {
                // Apply min-height to last message only if NOT loading (when loading, the loading indicator gets it)
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight =
                  isLastMessage && !isLoading && minHeightForLastMessage > 0;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-3",
                      message.role === "user"
                        ? "justify-end items-start"
                        : "justify-start items-start"
                    )}
                    style={
                      shouldApplyMinHeight
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                  >
                    {message.role === "assistant" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="size-4 text-primary" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2.5",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </p>
                      )}
                    </div>

                    {message.role === "user" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                        <User className="size-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div
                  className="flex items-start gap-3"
                  style={
                    minHeightForLastMessage > 0
                      ? { minHeight: `${minHeightForLastMessage}px` }
                      : undefined
                  }
                >
                  <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="size-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-2.5">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-1 p-4 border-t bg-background/50"
      >
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              userEditedRef.current = true;
              if (countdown !== null) setCountdown(null);
              setInput(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={speech.isListening ? "Écoute en cours…" : placeholder}
            className={cn(
              "flex-1 max-h-32 resize-none min-h-9",
              speech.isListening && "italic text-muted-foreground"
            )}
            rows={1}
          />

          {enableVoice && (
            <div className="relative shrink-0">
              {speech.isListening && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-md bg-red-500/40 animate-ping"
                />
              )}
              <Button
                type="button"
                size="icon"
                variant={speech.isListening ? "destructive" : "outline"}
                onClick={handleMicClick}
                disabled={!speech.isSupported}
                className="relative h-[38px] w-[38px]"
                aria-label={speech.isListening ? "Arrêter la dictée" : "Dictée vocale"}
                title={
                  !speech.isSupported
                    ? "Dictée vocale non disponible sur ce navigateur. Utilise Chrome ou Safari."
                    : speech.isListening
                    ? "Arrêter la dictée"
                    : "Dictée vocale"
                }
              >
                {speech.isListening ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
            </div>
          )}

          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="shrink-0 h-[38px] w-[38px]"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>

        {enableVoice && speech.isListening && (() => {
          const max = speech.silenceMaxMs || 1;
          const remaining = speech.silenceCountdownMs ?? max;
          // Pourcentage RESTANT (la barre se vide pendant le silence).
          const pct = Math.max(0, Math.min(100, (remaining / max) * 100));
          const secondsLeft = Math.ceil(remaining / 1000);
          return (
            <div className="flex flex-col gap-1.5 px-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-red-500 font-medium">
                  Écoute en cours… arrêt dans {secondsLeft}s si silence
                </p>
                <button
                  type="button"
                  onClick={sendNow}
                  disabled={isLoading || !(speech.transcript || input).trim()}
                  className="text-[11px] font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-600/40 disabled:cursor-not-allowed rounded px-2.5 py-1 transition-colors"
                >
                  Envoyer maintenant →
                </button>
              </div>
              <div
                className="h-1 w-full bg-red-100 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Temps de silence restant"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
              >
                <div
                  className="h-full bg-red-500 transition-[width] duration-100 linear"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })()}
        {enableVoice && countdown !== null && (
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-blue-600 font-medium">
              Envoi dans {countdown}…
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancelAutoSend}
                className="text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 rounded px-2.5 py-1 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={sendNow}
                disabled={isLoading || !input.trim()}
                className="text-[11px] font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-600/40 disabled:cursor-not-allowed rounded px-2.5 py-1 transition-colors"
              >
                Envoyer maintenant →
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
