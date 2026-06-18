import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useModules } from "../application/use-modules";
import {
  CATEGORIES,
  POPULAR_SLUGS,
  countByCategorie,
  filterByCategorie,
  moduleCounts,
  popularModules,
  progressPct,
  toCategorie,
  toPlan,
  type Categorie,
  type Module,
  type Plan,
} from "../domain/module";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRight, Bell, Calculator, Calendar, FileCheck, FileText, Globe,
  LayoutGrid, Lock, MapPin, MessageCircle, Package, PenTool, Receipt,
  ShoppingCart, Sparkles, Star, Users, Wrench, type LucideIcon,
} from "lucide-react";
import { Switch } from "@/shared/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

// Page Mes modules du FRONT NEUF (`/modules`) — MIGRATION clean-archi de `pages/Modules.tsx`
// (activation des fonctionnalités ; legacy chaînes EN DUR + type local + cast → i18n namespace `modules`
// + types `RouterOutputs`). Données & mutation via `useModules` (couche application, seule à importer
// tRPC) ; filtres/compteurs/populaires via le domaine (purs, testés). Présentation pure, 0 `any`.

const ICON_MAP: Record<string, LucideIcon> = {
  Bell, Calculator, Calendar, FileCheck, FileText, Globe, LayoutGrid,
  MapPin, MessageCircle, Package, PenTool, Receipt, ShoppingCart, Sparkles,
  Users, Wrench,
};

// Couleurs de marque par catégorie (présentation). Le LIBELLÉ vit en i18n (`CAT_LABEL`).
const CATEGORIE_META: Record<Categorie, { gradient: string; pillBg: string; pillBgActive: string; pillBorder: string; glow: string }> = {
  commercial: { gradient: "from-emerald-500 to-green-600", pillBg: "text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", pillBgActive: "bg-gradient-to-r from-emerald-500 to-green-600 text-white border-transparent", pillBorder: "border-emerald-300", glow: "hover:shadow-emerald-500/20" },
  clients: { gradient: "from-orange-500 to-amber-600", pillBg: "text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800", pillBgActive: "bg-gradient-to-r from-orange-500 to-amber-600 text-white border-transparent", pillBorder: "border-orange-300", glow: "hover:shadow-orange-500/20" },
  terrain: { gradient: "from-rose-500 to-red-600", pillBg: "text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800", pillBgActive: "bg-gradient-to-r from-rose-500 to-red-600 text-white border-transparent", pillBorder: "border-rose-300", glow: "hover:shadow-rose-500/20" },
  gestion: { gradient: "from-violet-500 to-purple-600", pillBg: "text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800", pillBgActive: "bg-gradient-to-r from-violet-500 to-purple-600 text-white border-transparent", pillBorder: "border-violet-300", glow: "hover:shadow-violet-500/20" },
  ia: { gradient: "from-indigo-500 via-violet-500 to-fuchsia-500", pillBg: "text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800", pillBgActive: "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white border-transparent shadow-violet-500/40", pillBorder: "border-indigo-300", glow: "hover:shadow-violet-500/30" },
  parametres: { gradient: "from-slate-500 to-slate-600", pillBg: "text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700", pillBgActive: "bg-gradient-to-r from-slate-500 to-slate-600 text-white border-transparent", pillBorder: "border-slate-300", glow: "hover:shadow-slate-500/20" },
};
const CAT_LABEL: Record<Categorie, string> = { commercial: "catCommercial", clients: "catClients", terrain: "catTerrain", gestion: "catGestion", ia: "catIa", parametres: "catParametres" };

const PLAN_META: Record<Plan, { bg: string; text: string; lockedBg: string; lockedText: string }> = {
  essentiel: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", lockedBg: "bg-amber-100 dark:bg-amber-900/40", lockedText: "text-amber-700 dark:text-amber-300" },
  pro: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", lockedBg: "bg-orange-100 dark:bg-orange-900/40", lockedText: "text-orange-700 dark:text-orange-300" },
  entreprise: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300", lockedBg: "bg-rose-100 dark:bg-rose-900/40", lockedText: "text-rose-700 dark:text-rose-300" },
};
const PLAN_LABEL: Record<Plan, string> = { essentiel: "planEssentiel", pro: "planPro", entreprise: "planEntreprise" };

export default function ModulesPage() {
  const { t } = useTranslation("modules");
  const { modules: list, isLoading, toggle: toggleMutation } = useModules();
  const [filter, setFilter] = useState<Categorie | "all">("all");

  const filtered = useMemo(() => filterByCategorie(list, filter), [list, filter]);
  const popular = useMemo(() => popularModules(list, POPULAR_SLUGS), [list]);
  const counts = useMemo(() => moduleCounts(list), [list]);
  const pct = progressPct(counts);

  const handleToggle = (m: Module, next: boolean) => {
    if (m.locked) return;
    toggleMutation.mutate(
      { slug: m.slug, actif: next },
      {
        onSuccess: () => toast.success(next ? t("toastActive", { label: m.label }) : t("toastInactive", { label: m.label })),
        onError: (err) => toast.error(err.message || t("toastError")),
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* ───── HEADER en dégradé bleu ───── */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white p-6 md:p-8 shadow-lg"
        style={{ minHeight: 160 }}
      >
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-blob" />
          <div className="absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-violet-500/15 blur-3xl animate-blob animation-delay-2000" />
        </div>
        <div className="relative">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-blue-100/80 max-w-2xl">{t("subtitle")}</p>
          <div className="mt-5 max-w-md">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm text-blue-100/90">
                <span className="text-white font-bold text-base">{counts.actifs}</span>{" "}
                {t("progressSuffix", { total: counts.total })}
              </span>
              <span className="text-xs text-blue-200/70 tabular-nums">{Math.round(pct)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </motion.header>

      {/* ───── SECTION "Les plus utilisés" ───── */}
      {popular.length > 0 && !isLoading && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            {t("popularTitle")}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
            {popular.map((m: Module, i) => {
              const Icon = ICON_MAP[m.icon] || LayoutGrid;
              const cat = CATEGORIE_META[toCategorie(m.categorie)];
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  className="snap-start shrink-0 w-[220px] rounded-xl border border-border bg-card p-4 hover:shadow-lg transition-shadow"
                >
                  <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${cat.gradient} text-white inline-flex items-center justify-center shadow-md mb-3`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold truncate">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 min-h-[2.4em]">{m.description}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.actif ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                      {m.actif ? t("actif") : t("inactif")}
                    </span>
                    <Switch checked={m.actif} disabled={m.locked} onCheckedChange={(checked) => handleToggle(m, checked)} aria-label={t("activerAria", { label: m.label })} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* ───── FILTRES catégorie ───── */}
      <section>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all ${
              filter === "all"
                ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-transparent shadow-md shadow-blue-500/20"
                : "text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            }`}
          >
            {t("filterTous", { n: counts.total })}
          </button>
          {CATEGORIES.map((cat) => {
            const n = countByCategorie(list, cat);
            if (n === 0) return null;
            const meta = CATEGORIE_META[cat];
            const active = filter === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                  active ? `${meta.pillBgActive} shadow-md` : `bg-transparent ${meta.pillBg} hover:bg-muted/50`
                } ${cat === "ia" && active ? "animate-pulse-shimmer" : ""}`}
              >
                {t("filterCategorie", { label: t(CAT_LABEL[cat]), n })}
              </button>
            );
          })}
        </div>
      </section>

      {/* ───── GRILLE modules ───── */}
      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 rounded-2xl bg-muted/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div key={filter} className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m: Module, i) => {
              const Icon = ICON_MAP[m.icon] || LayoutGrid;
              const cat = CATEGORIE_META[toCategorie(m.categorie)];
              const planKey = toPlan(m.planMinimum);
              const plan = PLAN_META[planKey];
              const planLabel = t(PLAN_LABEL[planKey]);
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ delay: i * 0.05, duration: 0.3, ease: "easeOut" }}
                  whileHover={{ y: -2 }}
                  className={`group relative bg-card text-card-foreground rounded-2xl border p-5 shadow-sm hover:shadow-xl transition-all ${cat.glow} ${
                    m.locked ? "border-border bg-muted/20 opacity-90" : m.actif ? `${cat.pillBorder} bg-gradient-to-br from-card to-card/70` : "border-border"
                  }`}
                  style={{ minHeight: 200 }}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className={`relative h-16 w-16 rounded-2xl bg-gradient-to-br ${cat.gradient} text-white inline-flex items-center justify-center shadow-lg ${m.locked ? "grayscale opacity-60" : ""}`}>
                      <Icon className="h-8 w-8" />
                      {m.locked && (
                        <span className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full bg-background border-2 border-border inline-flex items-center justify-center shadow-md">
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      )}
                    </div>
                    {m.locked ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span><Switch checked={false} disabled aria-label={t("lockedAria")} /></span>
                        </TooltipTrigger>
                        <TooltipContent>{t("lockedTooltip", { plan: planLabel })}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Switch checked={m.actif} onCheckedChange={(checked) => handleToggle(m, checked)} aria-label={t("activerAria", { label: m.label })} className="scale-110" />
                    )}
                  </div>

                  <h3 className="text-lg font-bold tracking-tight mb-1">{m.label}</h3>
                  <span className={`inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded-full mb-2 ${m.locked ? `${plan.lockedBg} ${plan.lockedText}` : `${plan.bg} ${plan.text}`}`}>
                    {planLabel}
                  </span>
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5em]">{m.description || ""}</p>

                  {m.locked && (
                    <button
                      type="button"
                      onClick={() => toast.info(t("toastUpgradeSoon"))}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-semibold px-3 py-2 shadow-md hover:shadow-lg transition-all group/btn"
                    >
                      {t("unlockBtn", { plan: planLabel })}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
