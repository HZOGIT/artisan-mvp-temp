import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

const SEEN_KEY = "operioz.assistant.seen";

// Bouton flottant (FAB) ouvrant MonAssistant. PORT FIDÈLE d'AssistantFAB : pulse au 1er affichage tant que
// l'utilisateur n'a pas cliqué (persisté localStorage). Masqué sur la page assistant elle-même (`hidden`).
export function AssistantFAB({ onClick, hidden = false }: { onClick: () => void; hidden?: boolean }) {
  const { t } = useTranslation("shell");
  const [pulse, setPulse] = useState(false);
  useEffect(() => { setPulse(localStorage.getItem(SEEN_KEY) !== "true"); }, []);
  if (hidden) return null;
  const handleClick = () => {
    if (pulse) { localStorage.setItem(SEEN_KEY, "true"); setPulse(false); }
    onClick();
  };
  return (
    <button type="button" onClick={handleClick} className="group fixed bottom-6 right-6 z-30 h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center" aria-label={t("demanderAssistant")}>
      {pulse && <span aria-hidden className="absolute inset-0 rounded-full bg-blue-500/50 animate-ping" />}
      <Sparkles className="relative h-6 w-6" />
      <span className="absolute right-full mr-3 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg">{t("demanderAssistant")}</span>
    </button>
  );
}
