import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const SEEN_KEY = "operioz.assistant.seen";

interface AssistantFABProps {
  onClick: () => void;
  /** Si vrai, le FAB est complètement masqué (ex: sur la page /assistant) */
  hidden?: boolean;
}

/**
 * Bouton flottant en bas à droite qui ouvre MonAssistant.
 * Pulse au premier affichage tant que l'utilisateur n'a pas cliqué dessus
 * au moins une fois (persisté en localStorage).
 */
export function AssistantFAB({ onClick, hidden = false }: AssistantFABProps) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    setPulse(localStorage.getItem(SEEN_KEY) !== "true");
  }, []);

  if (hidden) return null;

  const handleClick = () => {
    if (pulse) {
      localStorage.setItem(SEEN_KEY, "true");
      setPulse(false);
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group fixed bottom-6 right-6 z-30 h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
      aria-label="Demander à MonAssistant"
    >
      {pulse && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-blue-500/50 animate-ping"
        />
      )}
      <Sparkles className="relative h-6 w-6" />
      <span className="absolute right-full mr-3 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg">
        Demander à MonAssistant
      </span>
    </button>
  );
}
