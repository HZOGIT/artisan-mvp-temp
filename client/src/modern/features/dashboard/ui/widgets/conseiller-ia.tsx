import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Sparkles, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { resolveV2Path } from "@/modern/shared/flag/v2-routes";
import { useConseilsIA } from "../../application/use-conseils-ia";

// Conseiller IA du dashboard (priorités du jour). Re-port de components/ConseillerIAWidget (clean-archi, i18n, nav /v2).
const CACHE_KEY = "operioz:conseils_ia";
const CACHE_TTL = 4 * 60 * 60 * 1000;
type Conseil = { icone?: string; titre: string; message: string; actionLabel?: string; actionLien?: string };
type CachedPayload = { ts: number; conseils: Conseil[] };

function readCache(): CachedPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
    const data = JSON.parse(raw) as CachedPayload;
    if (!data || !Array.isArray(data.conseils) || Date.now() - data.ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}
function writeCache(conseils: Conseil[]) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), conseils })); } catch { /* quota */ } }

export function ConseillerIAWidget() {
  const { t } = useTranslation("dashboard");
  const [, setLocation] = useLocation();
  const [cached, setCached] = useState<CachedPayload | null>(() => readCache());
  const [refreshTick, setRefreshTick] = useState(0);
  const { data, isLoading, refetch } = useConseilsIA(!cached || refreshTick > 0);

  useEffect(() => {
    if (data?.conseils && Array.isArray(data.conseils) && data.conseils.length > 0) {
      writeCache(data.conseils as Conseil[]); setCached({ ts: Date.now(), conseils: data.conseils as Conseil[] });
    }
  }, [data]);

  const conseils = useMemo<Conseil[]>(() => (cached ? cached.conseils : data?.conseils ? (data.conseils as Conseil[]) : []), [cached, data]);

  const handleRefresh = () => { try { localStorage.removeItem(CACHE_KEY); } catch { /* ok */ } setCached(null); setRefreshTick((n) => n + 1); refetch(); };

  if (isLoading && conseils.length === 0) {
    return (
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4">
        <div className="flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-violet-600 animate-pulse" /><span className="text-sm font-semibold text-violet-900">{t("cia_titre")}</span></div>
        <p className="text-xs text-violet-700">{t("cia_analyse")}</p>
      </div>
    );
  }
  if (conseils.length === 0) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /><span className="text-sm font-semibold text-violet-900">{t("cia_priorites")}</span></div>
        <button onClick={handleRefresh} className="text-xs text-violet-700 hover:text-violet-900 inline-flex items-center gap-1" title={t("cia_regenerer")}><RefreshCw className="h-3 w-3" /> {t("cia_actualiser")}</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {conseils.slice(0, 3).map((c, i) => (
          <div key={i} className="bg-white/70 rounded-lg p-3 border border-violet-100 flex flex-col">
            <div className="flex items-start gap-2 mb-1"><span className="text-lg leading-none">{c.icone || "💡"}</span><span className="text-sm font-semibold text-gray-900 flex-1">{c.titre}</span></div>
            <p className="text-xs text-gray-600 flex-1 mb-2">{c.message}</p>
            {c.actionLien && c.actionLabel && (
              <Button size="sm" variant="ghost" className="h-7 text-xs justify-start px-2 text-violet-700 hover:text-violet-900 hover:bg-violet-100" onClick={() => setLocation(resolveV2Path(c.actionLien!) ?? c.actionLien!)}>{c.actionLabel} <ChevronRight className="h-3 w-3 ml-1" /></Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
