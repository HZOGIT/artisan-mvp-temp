import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, FileText, Plus, Receipt, Search } from "lucide-react";

/** Bandeau de bienvenue du dashboard — re-port de components/dashboard/WelcomeBanner (i18n + pluriels react-i18next). */
interface WelcomeBannerProps {
  firstName?: string | null;
  devisEnAttente?: number;
  facturesImpayees?: number;
  interventionsAVenir?: number;
  onCreateDevis?: () => void;
  onCreateFacture?: () => void;
  onCreateIntervention?: () => void;
  onOpenSearch?: () => void;
}

export function WelcomeBanner({ firstName, devisEnAttente = 0, facturesImpayees = 0, interventionsAVenir = 0, onCreateDevis, onCreateFacture, onCreateIntervention, onOpenSearch }: WelcomeBannerProps) {
  const { t } = useTranslation("dashboard");
  const now = new Date();
  const today = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hour = now.getHours();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const greeting = hour < 6 ? t("wb_greetingNight") : hour < 12 ? t("wb_greetingMorning") : hour < 18 ? t("wb_greetingAfternoon") : t("wb_greetingEvening");

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (devisEnAttente > 0) parts.push(t("wb_devisEnAttente", { count: devisEnAttente }));
    if (facturesImpayees > 0) parts.push(t("wb_facturesImpayees", { count: facturesImpayees }));
    if (interventionsAVenir > 0) parts.push(t("wb_interventionsAVenir", { count: interventionsAVenir }));
    if (parts.length === 0) return isWeekend ? t("wb_summaryWeekend") : t("wb_summaryCalm");
    let s = t("wb_summaryHas", { parts: parts.join(", ").replace(/, ([^,]*)$/, " et $1") });
    if (facturesImpayees >= 3) s += t("wb_relanceFactures");
    else if (devisEnAttente >= 5) s += t("wb_relanceProspects");
    return s;
  }, [devisEnAttente, facturesImpayees, interventionsAVenir, isWeekend, t]);

  const [isMac, setIsMac] = useState(false);
  useEffect(() => { if (typeof navigator !== "undefined") setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)); }, []);
  const cmdKey = isMac ? "⌘" : "Ctrl";

  return (
    <motion.section initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white shadow-lg">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -left-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-blob" />
        <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-fuchsia-400/15 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/3 h-40 w-40 rounded-full bg-emerald-300/10 blur-2xl animate-blob animation-delay-4000" />
      </div>
      <div className="relative p-6 md:p-8">
        <p className="text-xs uppercase tracking-widest font-medium text-blue-200/80">{today}</p>
        <h1 className="mt-2 text-2xl md:text-3xl font-bold leading-tight">{greeting}{firstName ? ` ${firstName}` : ""} 👋</h1>
        <p className="mt-2 text-sm md:text-base text-blue-100/90 max-w-2xl">{summary}</p>
        <div className="mt-5 flex flex-wrap gap-2 items-center">
          {onCreateDevis && <button type="button" onClick={onCreateDevis} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-2 text-sm font-medium transition-all border border-white/20 hover:border-white/30"><Plus className="h-4 w-4" /> <FileText className="h-3.5 w-3.5" /> {t("wb_btnDevis")}</button>}
          {onCreateFacture && <button type="button" onClick={onCreateFacture} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-2 text-sm font-medium transition-all border border-white/20 hover:border-white/30"><Plus className="h-4 w-4" /> <Receipt className="h-3.5 w-3.5" /> {t("wb_btnFacture")}</button>}
          {onCreateIntervention && <button type="button" onClick={onCreateIntervention} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-2 text-sm font-medium transition-all border border-white/20 hover:border-white/30"><Plus className="h-4 w-4" /> <Calendar className="h-3.5 w-3.5" /> {t("wb_btnIntervention")}</button>}
          {onOpenSearch && <button type="button" onClick={onOpenSearch} title={t("wb_rechercheGlobale")} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-white/5 hover:bg-white/15 backdrop-blur-sm px-2.5 py-1.5 text-xs text-blue-100/90 hover:text-white transition-all border border-white/10 hover:border-white/20"><Search className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t("wb_rechercher")}</span><kbd className="inline-flex items-center rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">{`${cmdKey} K`}</kbd></button>}
        </div>
      </div>
    </motion.section>
  );
}
