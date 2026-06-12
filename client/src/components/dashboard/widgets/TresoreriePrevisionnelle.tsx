import { trpc } from "@/lib/trpc";
import { TrendingDown, AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { WidgetSkeleton } from "./WidgetSkeleton";

// OPE-155 — trésorerie prévisionnelle : flux net (encaissements − décaissements) par
// semaine sur 8 semaines, + alerte si le cumul net passe sous zéro (découvert anticipé).
// Lecture seule, données existantes (factures à encaisser + dépenses récurrentes).

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function TresoreriePrevisionnelleWidget() {
  const { data, isLoading } = trpc.previsions.getTresoreriePrevisionnelle.useQuery({ semaines: 8 });

  if (isLoading) return <WidgetSkeleton height={260} lines={5} />;

  const semaines = data?.semaines || [];
  const pireCumul = semaines.reduce((min: number, s: any) => Math.min(min, s.cumulatif), 0);
  const decouvert = pireCumul < 0;

  if (semaines.length === 0 || (data?.totalEntrees === 0 && data?.totalSorties === 0)) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2">
        <TrendingDown className="h-8 w-8 opacity-30" />
        <p className="text-sm text-center">
          Aucune échéance de facture ni dépense récurrente sur les 8 prochaines semaines.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Synthèse */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-emerald-50 p-2">
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> Encaissements
          </p>
          <p className="text-sm font-bold text-emerald-700">{eur(data?.totalEntrees || 0)}</p>
        </div>
        <div className="rounded-lg bg-rose-50 p-2">
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <ArrowDownRight className="h-3 w-3" /> Décaissements
          </p>
          <p className="text-sm font-bold text-rose-700">{eur(data?.totalSorties || 0)}</p>
        </div>
        <div className="rounded-lg bg-muted p-2">
          <p className="text-[11px] text-muted-foreground">Net (8 sem.)</p>
          <p className={`text-sm font-bold ${(data?.totalNet || 0) < 0 ? "text-rose-700" : "text-emerald-700"}`}>
            {(data?.totalNet || 0) >= 0 ? "+" : ""}{eur(data?.totalNet || 0)}
          </p>
        </div>
      </div>

      {decouvert && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-800 text-xs">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Découvert anticipé</strong> : le flux net cumulé descend jusqu'à{" "}
            <strong>{eur(pireCumul)}</strong> sur la période (hors solde bancaire actuel). Anticipez
            l'encaissement de vos impayés ou le décalage de certaines dépenses.
          </span>
        </div>
      )}

      {/* Tableau semaine par semaine */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="text-left font-medium py-1">Semaine du</th>
              <th className="text-right font-medium py-1">Entrées</th>
              <th className="text-right font-medium py-1">Sorties</th>
              <th className="text-right font-medium py-1">Net cumulé</th>
            </tr>
          </thead>
          <tbody>
            {semaines.map((s: any) => (
              <tr key={s.debut} className="border-b last:border-0">
                <td className="py-1.5">{new Date(s.debut).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</td>
                <td className="py-1.5 text-right text-emerald-700">{s.entrees > 0 ? eur(s.entrees) : "—"}</td>
                <td className="py-1.5 text-right text-rose-700">{s.sorties > 0 ? eur(s.sorties) : "—"}</td>
                <td className={`py-1.5 text-right font-semibold ${s.cumulatif < 0 ? "text-rose-700" : ""}`}>
                  {s.cumulatif >= 0 ? "+" : ""}{eur(s.cumulatif)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Encaissements = factures à encaisser (par échéance) ; sorties = dépenses récurrentes. Hors solde bancaire actuel.
      </p>
    </div>
  );
}
