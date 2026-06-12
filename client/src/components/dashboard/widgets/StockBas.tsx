import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { PackageX, PackageCheck, AlertTriangle } from "lucide-react";
import { WidgetSkeleton } from "./WidgetSkeleton";

// OPE-133 — indicateur (lecture seule) du stock à réapprovisionner : articles dont la
// quantité est sous le seuil d'alerte. Surface le besoin de réappro sur le dashboard
// (le Stock page a un onglet « Stock bas », ici c'est proactif à l'accueil). Données
// scopées artisan côté serveur (stocks.getLowStock). Pas de génération de commande ici.

export function StockBasWidget() {
  const { data, isLoading } = trpc.stocks.getLowStock.useQuery();

  if (isLoading) return <WidgetSkeleton height={220} lines={4} />;

  const items = data || [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground py-8 gap-2">
        <PackageCheck className="h-8 w-8 opacity-30" />
        <p className="text-sm">Aucun article sous le seuil.</p>
      </div>
    );
  }

  const nbRupture = items.filter((s: any) => s.enRupture).length;

  return (
    <div className="space-y-2">
      <Link
        href="/stocks?filtre=alerte"
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-rose-500 hover:underline"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {items.length} à réapprovisionner{nbRupture > 0 ? ` · ${nbRupture} en rupture` : ""}
      </Link>
      {items.slice(0, 6).map((s: any) => (
        <Link
          key={s.id}
          href="/stocks?filtre=alerte"
          className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2.5 hover:border-rose-300 transition-colors"
        >
          <PackageX className={`h-4 w-4 mt-0.5 shrink-0 ${s.enRupture ? "text-rose-600" : "text-amber-500"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{s.designation}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={s.enRupture ? "font-semibold text-rose-600" : ""}>
                {s.quantiteEnStock} {s.unite || ""} en stock
              </span>
              <span>seuil {s.seuilAlerte}</span>
              {s.manque > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">
                  manque {s.manque}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
