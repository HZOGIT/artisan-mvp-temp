import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

// Cache 4h cote client : evite de bruler le quota Claude.
const CACHE_KEY = "operioz:conseils_ia";
const CACHE_TTL = 4 * 60 * 60 * 1000;

type Conseil = {
  icone?: string;
  titre: string;
  message: string;
  actionLabel?: string;
  actionLien?: string;
};

type CachedPayload = {
  ts: number;
  conseils: Conseil[];
};

function readCache(): CachedPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedPayload;
    if (!data || !Array.isArray(data.conseils)) return null;
    if (Date.now() - data.ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function writeCache(conseils: Conseil[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), conseils }));
  } catch {/* quota plein, ignore */}
}

export function ConseillerIAWidget() {
  const [, setLocation] = useLocation();
  const [cached, setCached] = useState<CachedPayload | null>(() => readCache());
  const [refreshTick, setRefreshTick] = useState(0);

  const shouldFetch = !cached;
  const { data, isLoading, refetch } = trpc.conseilsIA.useQuery(undefined, {
    enabled: shouldFetch || refreshTick > 0,
    staleTime: CACHE_TTL,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (data?.conseils && Array.isArray(data.conseils) && data.conseils.length > 0) {
      writeCache(data.conseils);
      setCached({ ts: Date.now(), conseils: data.conseils });
    }
  }, [data]);

  const conseils = useMemo<Conseil[]>(() => {
    if (cached) return cached.conseils;
    if (data?.conseils) return data.conseils as Conseil[];
    return [];
  }, [cached, data]);

  const handleRefresh = () => {
    try { localStorage.removeItem(CACHE_KEY); } catch {/* ok */}
    setCached(null);
    setRefreshTick((n) => n + 1);
    refetch();
  };

  if (isLoading && conseils.length === 0) {
    return (
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-violet-600 animate-pulse" />
          <span className="text-sm font-semibold text-violet-900">Conseiller IA</span>
        </div>
        <p className="text-xs text-violet-700">Analyse de votre activite en cours...</p>
      </div>
    );
  }

  if (conseils.length === 0) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-semibold text-violet-900">Conseiller IA - vos priorites du jour</span>
        </div>
        <button
          onClick={handleRefresh}
          className="text-xs text-violet-700 hover:text-violet-900 inline-flex items-center gap-1"
          title="Regenerer les conseils"
        >
          <RefreshCw className="h-3 w-3" /> Actualiser
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {conseils.slice(0, 3).map((c, i) => (
          <div key={i} className="bg-white/70 rounded-lg p-3 border border-violet-100 flex flex-col">
            <div className="flex items-start gap-2 mb-1">
              <span className="text-lg leading-none">{c.icone || "💡"}</span>
              <span className="text-sm font-semibold text-gray-900 flex-1">{c.titre}</span>
            </div>
            <p className="text-xs text-gray-600 flex-1 mb-2">{c.message}</p>
            {c.actionLien && c.actionLabel && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs justify-start px-2 text-violet-700 hover:text-violet-900 hover:bg-violet-100"
                onClick={() => setLocation(c.actionLien!)}
              >
                {c.actionLabel} <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
