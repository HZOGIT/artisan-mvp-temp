import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PiggyBank, Copy, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function BudgetsDepenses() {
  const [mois, setMois] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: budgets, refetch } = trpc.depenses.getBudgets.useQuery({ mois });

  const setMut = trpc.depenses.setBudget.useMutation({
    onSuccess: () => {
      toast.success("Budget mis à jour");
      refetch();
    },
  });
  const copyMut = trpc.depenses.copierBudgetsMois.useMutation({
    onSuccess: () => {
      toast.success("Budgets copiés depuis le mois précédent");
      refetch();
    },
  });

  // Reset drafts quand on change de mois
  useEffect(() => {
    setDrafts({});
  }, [mois]);

  function moisPrecedent(m: string): string {
    const [y, mm] = m.split("-").map(Number);
    const d = new Date(y, mm - 2, 1);
    return d.toISOString().slice(0, 7);
  }

  const totalBudget = useMemo(
    () => (budgets || []).reduce((s: number, b: any) => s + Number(b.budget || 0), 0),
    [budgets]
  );
  const totalReel = useMemo(
    () => (budgets || []).reduce((s: number, b: any) => s + Number(b.reel || 0), 0),
    [budgets]
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PiggyBank className="h-7 w-7 text-emerald-600" /> Budgets
          </h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(mois + "-01"), "MMMM yyyy", { locale: fr })} — par catégorie
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="month"
            value={mois}
            onChange={(e) => setMois(e.target.value)}
            className="w-[160px]"
          />
          <Button
            variant="outline"
            onClick={() =>
              copyMut.mutate({ moisSource: moisPrecedent(mois), moisCible: mois })
            }
            disabled={copyMut.isPending}
          >
            <Copy className="h-4 w-4 mr-2" /> Copier mois précédent
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Totaux du mois</CardTitle>
            <CardDescription>
              {totalBudget > 0 ? `${Math.round((totalReel / totalBudget) * 100)}% consommé` : ""}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-muted-foreground">Budget</div>
              <div className="text-2xl font-bold">{eur(totalBudget)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Réalisé</div>
              <div className="text-2xl font-bold">{eur(totalReel)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Restant</div>
              <div className={"text-2xl font-bold " + (totalBudget - totalReel < 0 ? "text-rose-600" : "text-emerald-600")}>
                {eur(totalBudget - totalReel)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Par catégorie</CardTitle>
          <CardDescription>Edite le budget directement dans la grille.</CardDescription>
        </CardHeader>
        <CardContent>
          {!budgets || budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucune catégorie configurée. Les catégories par défaut sont seedées au boot.
            </p>
          ) : (
            <div className="space-y-2">
              {budgets.map((b: any) => {
                const draftKey = b.categorie;
                const draftVal = drafts[draftKey];
                const display = draftVal !== undefined ? draftVal : String(b.budget || 0);
                const pct = Math.min(100, b.pct);
                const couleur = b.pct > 100 ? "bg-rose-500" : b.pct > 75 ? "bg-orange-500" : "bg-emerald-500";
                return (
                  <div key={b.categorie} className="grid grid-cols-12 gap-2 items-center p-2 rounded border">
                    <div className="col-span-12 sm:col-span-4 flex items-center gap-2 min-w-0">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: b.couleur }} />
                      <span className="text-sm font-medium truncate">{b.categorie}</span>
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <Input
                        type="number"
                        step="10"
                        min="0"
                        value={display}
                        onChange={(e) => setDrafts((d) => ({ ...d, [draftKey]: e.target.value }))}
                        onBlur={() => {
                          const v = parseFloat(display);
                          if (!isNaN(v) && v !== Number(b.budget || 0)) {
                            setMut.mutate({ categorie: b.categorie, mois, budget: v });
                            setDrafts((d) => {
                              const next = { ...d };
                              delete next[draftKey];
                              return next;
                            });
                          }
                        }}
                        className="h-8 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-7 sm:col-span-3 text-right text-sm">
                      {eur(b.reel)} <span className="text-xs text-muted-foreground">/ {eur(b.budget)}</span>
                    </div>
                    <div className="col-span-12 sm:col-span-2">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${couleur}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-right text-muted-foreground">{b.pct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        <RotateCcw className="h-3 w-3 inline mr-1" />
        Astuce : édite un montant et clique ailleurs, le budget se sauvegarde automatiquement.
      </p>
    </div>
  );
}
