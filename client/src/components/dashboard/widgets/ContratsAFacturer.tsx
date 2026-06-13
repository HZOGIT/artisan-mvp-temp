import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { FileText, CalendarClock, CheckCircle2 } from "lucide-react";
import { WidgetSkeleton } from "./WidgetSkeleton";

// OPE-140 — indicateur (lecture seule) des contrats de maintenance à facturer :
// contrats actifs dont la date de prochaine facturation est atteinte/dépassée.
// Aide l'artisan à ne pas oublier de facturer un contrat récurrent (revenu).
// Données scopées artisan côté serveur (contrats.getAFacturer). Aucune génération auto.

const PERIODICITE_LABELS: Record<string, string> = {
  mensuel: "Mensuel",
  trimestriel: "Trimestriel",
  semestriel: "Semestriel",
  annuel: "Annuel",
};

export function ContratsAFacturerWidget() {
  const { data, isLoading } = trpc.contrats.getAFacturer.useQuery();

  if (isLoading) return <WidgetSkeleton height={220} lines={4} />;

  const contrats = data || [];

  if (contrats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground py-8 gap-2">
        <CheckCircle2 className="h-8 w-8 opacity-30" />
        <p className="text-sm">Aucun contrat à facturer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
        <CalendarClock className="h-3.5 w-3.5" />
        {contrats.length} à facturer
      </div>
      {contrats.slice(0, 6).map((c: any) => (
        <Link
          key={c.id}
          href={`/contrats/${c.id}`}
          className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5 hover:border-amber-300 transition-colors"
        >
          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {c.titre} — {c.clientNom}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{c.montantTTC} € TTC</span>
              {c.joursRetard > 0 ? (
                <span className="font-semibold text-amber-600">
                  échue depuis {c.joursRetard} j
                </span>
              ) : (
                <span>échéance aujourd'hui</span>
              )}
              <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">
                {PERIODICITE_LABELS[c.periodicite] || c.periodicite}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
