import { useEffect } from "react";
import { Sparkles, X, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { AIChatBox, type Message } from "./AIChatBox";

interface AssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
  onClear: () => void;
  /** Bulles de suggestion affichées dans l'empty state */
  suggestedPrompts?: string[];
}

/**
 * Panneau latéral droit qui héberge MonAssistant.
 * - 380px sur desktop, plein écran sur mobile.
 * - Overlay cliquable + ESC pour fermer.
 * - Bloque le scroll du body quand ouvert.
 */
export function AssistantDrawer({
  isOpen,
  onClose,
  messages,
  isStreaming,
  onSendMessage,
  onClear,
  suggestedPrompts,
}: AssistantDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  // AIChatBox affiche son propre indicateur de chargement.
  // On ne l'allume QUE le temps que le premier chunk arrive (assistant message vide),
  // sinon le texte streamé est déjà visible dans le dernier message.
  const lastMessage = messages[messages.length - 1];
  const waitingFirstChunk =
    isStreaming &&
    (!lastMessage || lastMessage.role === "user" || lastMessage.content === "");

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[380px] bg-background shadow-2xl border-l flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="MonAssistant"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">MonAssistant</p>
              <p className="text-[11px] text-muted-foreground">Assistant IA contextuel</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fermer le panneau"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Chat */}
        <div className="flex-1 min-h-0 flex flex-col">
          <AIChatBox
            messages={messages}
            onSendMessage={onSendMessage}
            isLoading={waitingFirstChunk}
            placeholder="Demande-moi ce que tu veux…"
            emptyStateMessage="Pose-moi une question sur ta page actuelle"
            height="100%"
            suggestedPrompts={suggestedPrompts}
            enableVoice
            className="border-0 shadow-none rounded-none flex-1"
          />
        </div>

        {/* Footer */}
        {messages.length > 0 && (
          <div className="p-3 border-t shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={onClear}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Effacer la conversation
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}
