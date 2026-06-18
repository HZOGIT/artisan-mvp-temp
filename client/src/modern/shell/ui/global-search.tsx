import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "@/modern/shared/router/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, FileText, Loader2, Receipt, Search, Users, Wrench, type LucideIcon } from "lucide-react";
import { trpc } from "@/modern/shared/trpc";
import { resolveV2Path } from "@/modern/shared/flag/v2-routes";
import { groupResults, flattenGroups } from "../domain/search";

// Recherche globale (Ctrl+K) du SHELL modern. PORT FIDÈLE de GlobalSearch : debounce 300ms, groupage par type
// (domain testé), navigation clavier ↑↓↵/Esc. Self-contained (search.global + wouter). Nav via resolveV2Path (/v2).
const TYPE_META: Record<string, { icon: LucideIcon; colorClass: string; iconBg: string }> = {
  client: { icon: Users, colorClass: "text-orange-600", iconBg: "bg-orange-100 dark:bg-orange-900/30" },
  devis: { icon: FileText, colorClass: "text-blue-600", iconBg: "bg-blue-100 dark:bg-blue-900/30" },
  facture: { icon: Receipt, colorClass: "text-emerald-600", iconBg: "bg-emerald-100 dark:bg-emerald-900/30" },
  intervention: { icon: Wrench, colorClass: "text-rose-600", iconBg: "bg-rose-100 dark:bg-rose-900/30" },
  fournisseur: { icon: Building2, colorClass: "text-violet-600", iconBg: "bg-violet-100 dark:bg-violet-900/30" },
};

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("shell");
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const tm = setTimeout(() => setDebouncedQuery(query.trim()), 300); return () => clearTimeout(tm); }, [query]);
  const { data, isLoading } = trpc.search.global.useQuery({ query: debouncedQuery || "" }, { enabled: open && debouncedQuery.length >= 2, staleTime: 30 * 1000 });
  useEffect(() => {
    if (!open) return undefined;
    setQuery(""); setDebouncedQuery(""); setSelectedIndex(0);
    const tm = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(tm);
  }, [open]);

  const results = data?.results ?? [];
  const grouped = useMemo(() => groupResults(results), [results]);
  const flatResults = useMemo(() => flattenGroups(grouped), [grouped]);
  useEffect(() => { setSelectedIndex(0); }, [debouncedQuery, results.length]);

  const navigateTo = (url: string) => { setLocation(resolveV2Path(url) ?? url); onOpenChange(false); };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onOpenChange(false); return; }
      if (flatResults.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => (i + 1) % flatResults.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => (i - 1 + flatResults.length) % flatResults.length); }
      else if (e.key === "Enter") { e.preventDefault(); const r = flatResults[selectedIndex]; if (r) navigateTo(r.url); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatResults, selectedIndex, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)} aria-hidden />
          <motion.div initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -8 }} transition={{ duration: 0.15 }} role="dialog" aria-label={t("rechercheGlobale")} className="fixed left-1/2 top-[15vh] -translate-x-1/2 z-50 w-[92vw] max-w-2xl rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="h-5 w-5 text-muted-foreground shrink-0" />
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} className="flex-1 bg-transparent outline-none text-base placeholder:text-muted-foreground" autoComplete="off" spellCheck={false} />
              {isLoading && debouncedQuery.length >= 2 && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
              <kbd className="hidden sm:inline-flex h-6 items-center rounded border border-border bg-muted/40 px-1.5 text-[10px] font-mono text-muted-foreground">{t("escKey")}</kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {!debouncedQuery || debouncedQuery.length < 2 ? (
                <div className="px-4 py-10 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t("tapez2Chars")}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{t("searchCategories")}</p>
                </div>
              ) : isLoading && !data ? (
                <div className="px-4 py-10 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t("rechercheEnCours")}</p>
                </div>
              ) : flatResults.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium">{t("aucunResultat")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("autresMotsCles")}</p>
                </div>
              ) : (
                <div className="py-2">
                  {grouped.map((group) => {
                    const meta = TYPE_META[group.type];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <div key={group.type} className="mb-2 last:mb-0">
                        <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t(`search_${group.type}`)} ({group.items.length})</div>
                        {group.items.map((item) => {
                          const flatIdx = flatResults.findIndex((r) => r.type === item.type && r.id === item.id);
                          const isSelected = flatIdx === selectedIndex;
                          return (
                            <button key={`${item.type}-${item.id}`} type="button" onMouseEnter={() => setSelectedIndex(flatIdx)} onClick={() => navigateTo(item.url)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-accent" : "hover:bg-accent/50"}`}>
                              <span className={`h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg ${meta.iconBg}`}><Icon className={`h-4 w-4 ${meta.colorClass}`} /></span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{item.title}</p>
                                {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
                              </div>
                              {isSelected && <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted/40 px-1.5 text-[10px] font-mono text-muted-foreground shrink-0">↵</kbd>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><kbd className="h-4 px-1 rounded border border-border bg-background font-mono">↑↓</kbd>{t("naviguer")}</span>
                <span className="inline-flex items-center gap-1"><kbd className="h-4 px-1 rounded border border-border bg-background font-mono">↵</kbd>{t("ouvrir")}</span>
              </div>
              <span className="hidden sm:inline">{t("propulsePar")}</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
