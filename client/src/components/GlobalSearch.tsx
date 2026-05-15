import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  FileText,
  Loader2,
  Receipt,
  Search,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

interface SearchResult {
  id: number;
  type: string;
  title: string;
  subtitle: string;
  url: string;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_META: Record<string, { label: string; icon: LucideIcon; colorClass: string; iconBg: string }> = {
  client: {
    label: "Clients",
    icon: Users,
    colorClass: "text-orange-600",
    iconBg: "bg-orange-100 dark:bg-orange-900/30",
  },
  devis: {
    label: "Devis",
    icon: FileText,
    colorClass: "text-blue-600",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
  },
  facture: {
    label: "Factures",
    icon: Receipt,
    colorClass: "text-emerald-600",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  intervention: {
    label: "Interventions",
    icon: Wrench,
    colorClass: "text-rose-600",
    iconBg: "bg-rose-100 dark:bg-rose-900/30",
  },
  fournisseur: {
    label: "Fournisseurs",
    icon: Building2,
    colorClass: "text-violet-600",
    iconBg: "bg-violet-100 dark:bg-violet-900/30",
  },
};

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce 300ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading } = trpc.search.global.useQuery(
    { query: debouncedQuery || "" },
    { enabled: open && debouncedQuery.length >= 2, staleTime: 30 * 1000 }
  );

  // Reset state quand on ferme/ouvre.
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      // Focus input apres l'animation d'ouverture.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results: SearchResult[] = data?.results || [];

  // Groupage par type pour l'affichage.
  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.type) || [];
      arr.push(r);
      map.set(r.type, arr);
    }
    // Ordre fixe : client, devis, facture, intervention, fournisseur.
    const order = ["client", "devis", "facture", "intervention", "fournisseur"];
    return order
      .map((t) => ({ type: t, items: map.get(t) || [] }))
      .filter((g) => g.items.length > 0);
  }, [results]);

  // Reset selection quand les resultats changent.
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery, results.length]);

  // Navigation clavier : on construit une liste aplatie en preservant
  // l'ordre du groupage pour que Tab/Up/Down corresponde a ce qu'on voit.
  const flatResults = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const navigateTo = (url: string) => {
    setLocation(url);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (flatResults.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % flatResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = flatResults[selectedIndex];
        if (r) navigateTo(r.url);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatResults, selectedIndex, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label="Recherche globale"
            className="fixed left-1/2 top-[15vh] -translate-x-1/2 z-50 w-[92vw] max-w-2xl rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
          >
            {/* Input header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="h-5 w-5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher clients, devis, factures, interventions…"
                className="flex-1 bg-transparent outline-none text-base placeholder:text-muted-foreground"
                autoComplete="off"
                spellCheck={false}
              />
              {isLoading && debouncedQuery.length >= 2 && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              )}
              <kbd className="hidden sm:inline-flex h-6 items-center rounded border border-border bg-muted/40 px-1.5 text-[10px] font-mono text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-y-auto">
              {!debouncedQuery || debouncedQuery.length < 2 ? (
                <div className="px-4 py-10 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Tapez au moins 2 caractères pour rechercher
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Clients · Devis · Factures · Interventions · Fournisseurs
                  </p>
                </div>
              ) : isLoading && !data ? (
                <div className="px-4 py-10 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Recherche…</p>
                </div>
              ) : flatResults.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium">Aucun résultat</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Essayez avec d'autres mots-clés
                  </p>
                </div>
              ) : (
                <div className="py-2">
                  {grouped.map((group) => {
                    const meta = TYPE_META[group.type];
                    if (!meta) return null;
                    return (
                      <div key={group.type} className="mb-2 last:mb-0">
                        <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {meta.label} ({group.items.length})
                        </div>
                        {group.items.map((item) => {
                          const flatIdx = flatResults.findIndex(
                            (r) => r.type === item.type && r.id === item.id
                          );
                          const isSelected = flatIdx === selectedIndex;
                          const Icon = meta.icon;
                          return (
                            <button
                              key={`${item.type}-${item.id}`}
                              type="button"
                              onMouseEnter={() => setSelectedIndex(flatIdx)}
                              onClick={() => navigateTo(item.url)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                isSelected ? "bg-accent" : "hover:bg-accent/50"
                              }`}
                            >
                              <span className={`h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg ${meta.iconBg}`}>
                                <Icon className={`h-4 w-4 ${meta.colorClass}`} />
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{item.title}</p>
                                {item.subtitle && (
                                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                                )}
                              </div>
                              {isSelected && (
                                <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted/40 px-1.5 text-[10px] font-mono text-muted-foreground shrink-0">
                                  ↵
                                </kbd>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="h-4 px-1 rounded border border-border bg-background font-mono">↑↓</kbd>
                  naviguer
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="h-4 px-1 rounded border border-border bg-background font-mono">↵</kbd>
                  ouvrir
                </span>
              </div>
              <span className="hidden sm:inline">Propulsé par Operioz</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
