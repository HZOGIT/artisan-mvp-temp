import type { TenantContext } from "../../../shared/tenant";
import { addMonthsClamped } from "../../../shared/date/add-months-clamped";
import type { TresorerieReader } from "./tresorerie-reader";
import type { TresorerieData, TresoreriePrevisionnelle } from "../domain/prevision-ca";

// Use-case `getTresoreriePrevisionnelle` : projette par SEMAINE le flux net (encaissements attendus
// − décaissements attendus) sur N semaines. Parité legacy `getTresoreriePrevisionnelle`.

const WEEK_MS = 7 * 24 * 3600 * 1000;
const STEP_MONTHS: Record<string, number> = { mensuelle: 1, trimestrielle: 3, annuelle: 12 };

function num(s: string | null | undefined): number {
  const n = parseFloat(String(s ?? "0"));
  return Number.isFinite(n) ? n : 0;
}
const r2 = (n: number): number => Math.round(n * 100) / 100;

// PUR : calcule la trésorerie prévisionnelle à partir des données brutes + `now` (testable). Une date
// passée (échue/en retard) retombe en semaine 0 ; hors fenêtre = ignorée. Les avoirs nettent les
// entrées les plus proches (planché à 0). Les dépenses récurrentes sont expansées (clamp fin de mois).
export function computeTresorerie(data: TresorerieData, semaines: number, now: Date): TresoreriePrevisionnelle {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const windowEnd = new Date(start.getTime() + semaines * WEEK_MS);
  const buckets = Array.from({ length: semaines }, (_, i) => ({
    debut: new Date(start.getTime() + i * WEEK_MS),
    entrees: 0,
    sorties: 0,
  }));
  const weekIndex = (d: Date): number => {
    const diff = d.getTime() - start.getTime();
    if (diff < 0) return 0;
    const idx = Math.floor(diff / WEEK_MS);
    return idx < semaines ? idx : -1;
  };

  // ── Encaissements : créances (reste dû) par date d'échéance ──
  for (const f of data.creances) {
    if (!f.dateEcheance) continue;
    const reste = num(f.totalTTC) - num(f.montantPaye);
    if (reste <= 0) continue;
    const ech = new Date(f.dateEcheance);
    if (isNaN(ech.getTime()) || ech >= windowEnd) continue;
    const idx = weekIndex(ech);
    if (idx >= 0) buckets[idx].entrees += reste;
  }

  // ── Avoirs (crédits) : nettés contre les entrées les plus PROCHES, planché à 0 ──
  let creditAvoirs = data.avoirsTotalTTC.reduce((s, a) => s + Math.abs(num(a)), 0);
  for (const b of buckets) {
    if (creditAvoirs <= 0) break;
    const use = Math.min(b.entrees, creditAvoirs);
    b.entrees -= use;
    creditAvoirs -= use;
  }

  // ── Décaissements : dépenses récurrentes expansées selon la fréquence ──
  for (const d of data.depensesRecurrentes) {
    const montant = num(d.montantTtc);
    if (montant <= 0 || !d.prochaineOccurrence) continue;
    const step = STEP_MONTHS[String(d.frequence)] ?? 0;
    let occ = new Date(d.prochaineOccurrence);
    let guard = 0;
    while (!isNaN(occ.getTime()) && occ < windowEnd && guard++ < 60) {
      const idx = weekIndex(occ);
      if (idx >= 0) buckets[idx].sorties += montant;
      if (step === 0) break; // fréquence inconnue → une seule occurrence
      occ = addMonthsClamped(occ, step);
    }
  }

  let cumul = 0;
  let totalEntrees = 0;
  let totalSorties = 0;
  const out = buckets.map((b) => {
    const net = b.entrees - b.sorties;
    cumul += net;
    totalEntrees += b.entrees;
    totalSorties += b.sorties;
    return { debut: b.debut.toISOString().slice(0, 10), entrees: r2(b.entrees), sorties: r2(b.sorties), net: r2(net), cumulatif: r2(cumul) };
  });
  return { semaines: out, totalEntrees: r2(totalEntrees), totalSorties: r2(totalSorties), totalNet: r2(totalEntrees - totalSorties) };
}

// Sans reader câblé → trésorerie vide (dégradation parité legacy : artisan inconnu → vide).
export async function getTresoreriePrevisionnelle(
  reader: TresorerieReader | undefined,
  ctx: TenantContext,
  semaines: number,
  now: Date = new Date(),
): Promise<TresoreriePrevisionnelle> {
  if (!reader) return { semaines: [], totalEntrees: 0, totalSorties: 0, totalNet: 0 };
  const data = await reader.load(ctx);
  return computeTresorerie(data, semaines, now);
}
