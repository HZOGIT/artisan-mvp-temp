import { useEffect, useState } from "react";
import { Sparkles, X, Trash2, PanelLeft, Maximize2, Globe, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Switch } from "./ui/switch";
import { AIChatBox, type Message } from "./AIChatBox";
import Assistant from "@/pages/Assistant";

const AUTO_SEND_STORAGE_KEY = "operioz.assistant.autoSend";

function getInitialAutoSend(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(AUTO_SEND_STORAGE_KEY);
  // Défaut true (comportement historique). Seul "false" désactive l'envoi auto.
  return raw !== "false";
}

export type AssistantPanelSize = "sm" | "md" | "lg";

interface AssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
  onClear: () => void;
  /** Bulles de suggestion affichées dans l'empty state */
  suggestedPrompts?: string[];
  /** Largeur du panneau desktop (sm/md/lg). Sur mobile, plein écran quel que soit le size. */
  panelSize?: AssistantPanelSize;
  onPanelSizeChange?: (size: AssistantPanelSize) => void;
}

const PANEL_WIDTH_CLASS: Record<AssistantPanelSize, string> = {
  sm: "sm:w-[380px]",
  md: "sm:w-[520px]",
  lg: "sm:w-[700px]",
};

const PANEL_SIZE_OPTIONS: {
  size: AssistantPanelSize;
  label: string;
  icon: typeof PanelLeft;
  iconSize: string;
}[] = [
  { size: "sm", label: "Compact", icon: PanelLeft, iconSize: "h-3.5 w-3.5" },
  { size: "md", label: "Normal", icon: PanelLeft, iconSize: "h-4 w-4" },
  { size: "lg", label: "Large", icon: Maximize2, iconSize: "h-4 w-4" },
];

// ============================================================================
// Langues supportées par MonAssistant (vocal + UI)
// ============================================================================
//
// La locale BCP-47 est utilisée pour la Web Speech API. Le placeholder et
// l'empty state s'affichent dans la langue choisie. Les données saisies par
// l'artisan (et donc le contenu DB final : titre de devis, désignation de
// ligne…) restent en français — le system prompt côté serveur s'en charge.

type VoiceLangCode =
  | "fr-FR"
  | "ar-MA"
  | "ar-DZ"
  | "ar-TN"
  | "ar-SA"
  | "tr-TR"
  | "en-US"
  | "es-ES"
  | "pt-BR";

interface VoiceLangEntry {
  code: VoiceLangCode;
  flag: string;
  label: string;
  placeholder: string;
  emptyState: string;
  rtl?: boolean;
}

const VOICE_LANGS: VoiceLangEntry[] = [
  {
    code: "fr-FR",
    flag: "🇫🇷",
    label: "Français",
    placeholder: "Demande-moi ce que tu veux…",
    emptyState: "Pose-moi une question sur ta page actuelle",
  },
  {
    code: "ar-MA",
    flag: "🇲🇦",
    label: "العربية (المغرب) — Darija",
    placeholder: "قل لي اش بغيتي…",
    emptyState: "اسألني عن الصفحة الحالية",
    rtl: true,
  },
  {
    code: "ar-DZ",
    flag: "🇩🇿",
    label: "العربية (الجزائر) — Darja",
    placeholder: "قل لي واش تحب…",
    emptyState: "اسألني عن الصفحة الحالية",
    rtl: true,
  },
  {
    code: "ar-TN",
    flag: "🇹🇳",
    label: "العربية (تونس) — Derja",
    placeholder: "قل لي شنو تحب…",
    emptyState: "اسألني عن الصفحة الحالية",
    rtl: true,
  },
  {
    code: "ar-SA",
    flag: "🇸🇦",
    label: "العربية (الفصحى)",
    placeholder: "اطرح سؤالك…",
    emptyState: "اسألني عن صفحتك الحالية",
    rtl: true,
  },
  {
    code: "tr-TR",
    flag: "🇹🇷",
    label: "Türkçe",
    placeholder: "Ne istediğini söyle…",
    emptyState: "Mevcut sayfan hakkında bana sor",
  },
  {
    code: "en-US",
    flag: "🇬🇧",
    label: "English",
    placeholder: "Ask me anything…",
    emptyState: "Ask me about your current page",
  },
  {
    code: "es-ES",
    flag: "🇪🇸",
    label: "Español",
    placeholder: "Pregúntame lo que quieras…",
    emptyState: "Pregúntame sobre tu página actual",
  },
  {
    code: "pt-BR",
    flag: "🇧🇷",
    label: "Português",
    placeholder: "Pergunte-me qualquer coisa…",
    emptyState: "Pergunte sobre sua página atual",
  },
];

const VOICE_LANG_BY_CODE: Record<VoiceLangCode, VoiceLangEntry> = Object.fromEntries(
  VOICE_LANGS.map((l) => [l.code, l])
) as Record<VoiceLangCode, VoiceLangEntry>;

const VOICE_LANG_STORAGE_KEY = "operioz.voiceLang";

function isVoiceLangCode(v: unknown): v is VoiceLangCode {
  return typeof v === "string" && v in VOICE_LANG_BY_CODE;
}

/**
 * Détermine la langue initiale : (1) localStorage, (2) navigator.language
 * mappé sur une variante supportée, (3) fr-FR par défaut.
 */
function getInitialVoiceLang(): VoiceLangCode {
  if (typeof window === "undefined") return "fr-FR";
  const saved = window.localStorage.getItem(VOICE_LANG_STORAGE_KEY);
  if (isVoiceLangCode(saved)) return saved;

  const nav = (window.navigator.language || "").toLowerCase();
  // Match exact (ex: "ar-ma" → "ar-MA")
  for (const l of VOICE_LANGS) {
    if (l.code.toLowerCase() === nav) return l.code;
  }
  // Match préfixe : "ar-eg" → premier "ar-*" disponible (ar-SA Fusha)
  const prefix = nav.split("-")[0];
  if (prefix) {
    const fallback = VOICE_LANGS.find((l) => l.code.toLowerCase().startsWith(prefix + "-"));
    if (fallback) return fallback.code;
  }
  return "fr-FR";
}

/**
 * Panneau latéral droit qui héberge MonAssistant.
 * - Trois largeurs desktop (sm 380, md 520, lg 700), plein écran sur mobile.
 * - Overlay cliquable + ESC pour fermer.
 * - Bloque le scroll du body quand ouvert.
 * - Sélecteur de langue dans le footer (voix + placeholder + empty state).
 */
export function AssistantDrawer({
  isOpen,
  onClose,
  messages,
  isStreaming,
  onSendMessage,
  onClear,
  suggestedPrompts,
  panelSize = "md",
  onPanelSizeChange,
}: AssistantDrawerProps) {
  const [voiceLang, setVoiceLang] = useState<VoiceLangCode>(() => getInitialVoiceLang());
  const [autoSend, setAutoSend] = useState<boolean>(() => getInitialAutoSend());

  useEffect(() => {
    try {
      window.localStorage.setItem(VOICE_LANG_STORAGE_KEY, voiceLang);
    } catch {
      // localStorage indisponible (mode privé) : ignore.
    }
  }, [voiceLang]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_SEND_STORAGE_KEY, autoSend ? "true" : "false");
    } catch {
      /* noop */
    }
  }, [autoSend]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Sur desktop le drawer est un panneau collé à droite, pas modal : on ne
    // bloque pas le scroll de l'app. Sur mobile il occupe tout l'écran avec
    // overlay : on bloque pour éviter le scroll en arrière-plan.
    const mql = window.matchMedia("(max-width: 767px)");
    const isMobile = mql.matches;
    const prevOverflow = document.body.style.overflow;
    if (isMobile) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      if (isMobile) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [isOpen, onClose]);

  // AIChatBox affiche son propre indicateur de chargement.
  // On ne l'allume QUE le temps que le premier chunk arrive (assistant message vide),
  // sinon le texte streamé est déjà visible dans le dernier message.
  const lastMessage = messages[messages.length - 1];
  const waitingFirstChunk =
    isStreaming &&
    (!lastMessage || lastMessage.role === "user" || lastMessage.content === "");

  const langEntry = VOICE_LANG_BY_CODE[voiceLang];

  return (
    <>
      {/* Overlay — UNIQUEMENT sur mobile. Sur desktop le drawer est une colonne
          non-modale : pas d'overlay, l'artisan continue à voir et utiliser l'app. */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 md:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-full ${PANEL_WIDTH_CLASS[panelSize]} bg-background shadow-2xl border-l flex flex-col transition-[transform,width] duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="MonAssistant"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <div className="leading-tight min-w-0">
              <p className="text-sm font-semibold truncate">MonAssistant</p>
              <p className="text-[11px] text-muted-foreground truncate">Assistant IA contextuel</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onPanelSizeChange && (
              <div className="hidden md:flex items-center gap-0.5 mr-1 rounded-md border bg-muted/40 p-0.5">
                {PANEL_SIZE_OPTIONS.map(({ size, label, icon: Icon, iconSize }) => {
                  const isActive = panelSize === size;
                  return (
                    <Tooltip key={size}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onPanelSizeChange(size)}
                          aria-label={`Taille ${label}`}
                          aria-pressed={isActive}
                          className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isActive
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-background"
                          }`}
                        >
                          <Icon className={iconSize} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Fermer le panneau"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Assistant complet — MEME composant que la page /assistant (DRY),
            avec micro Gemini Live (vraie conversation vocale) + dictee. Monte
            uniquement quand le panneau est ouvert pour ne pas demarrer la
            session vocale en arriere-plan. */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-3 pb-3">
          {isOpen ? <Assistant embedded /> : null}
        </div>
      </aside>
    </>
  );
}
