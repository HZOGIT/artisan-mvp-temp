import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBudgets } from "../application/use-budgets";
import { budgetTotals, consommationPct, moisPrecedent, budgetLevel, clampPct, type Budget } from "../domain/budget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { PiggyBank, Copy, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// Page Budgets de dépenses du FRONT NEUF (`/budgets-depenses`) — MIGRATION clean-archi de
// `pages/BudgetsDepenses.tsx` (legacy en chaînes en dur → i18n namespace `budgetsDepenses`). Données &
// mutations via `useBudgets` (couche application, seule à importer tRPC) ; totaux/%, mois précédent,
// niveau de consommation via le domaine (fonctions pures testées). Présentation pure, 0 `any`.

const LEVEL_BAR: Record<ReturnType<typeof budgetLevel>, string> = {
  over: "bg-rose-500",
  warn: "bg-orange-500",
  ok: "bg-emerald-500",
};

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function BudgetsDepensesPage() {
  const { t } = useTranslation("budgetsDepenses");
  const [mois, setMois] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { budgets, setBudget: setMut, copyBudgets: copyMut } = useBudgets(mois);

  // Reset drafts quand on change de mois
  useEffect(() => {
    setDrafts({});
  }, [mois]);

  const totals = useMemo(() => budgetTotals(budgets), [budgets]);
  const pctGlobal = consommationPct(totals);

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PiggyBank className="h-7 w-7 text-emerald-600" /> {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("subtitle", { mois: format(new Date(mois + "-01"), "MMMM yyyy", { locale: fr }) })}
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
              copyMut.mutate(
                { moisSource: moisPrecedent(mois), moisCible: mois },
                { onSuccess: () => toast.success(t("toastBudgetsCopied")) },
              )
            }
            disabled={copyMut.isPending}
          >
            <Copy className="h-4 w-4 mr-2" /> {t("copyPrevMonth")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("totalsTitle")}</CardTitle>
            <CardDescription>{pctGlobal !== null ? t("consomme", { pct: pctGlobal }) : ""}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-muted-foreground">{t("budgetLabel")}</div>
              <div className="text-2xl font-bold">{eur(totals.budget)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("realiseLabel")}</div>
              <div className="text-2xl font-bold">{eur(totals.reel)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("restantLabel")}</div>
              <div className={"text-2xl font-bold " + (totals.restant < 0 ? "text-rose-600" : "text-emerald-600")}>
                {eur(totals.restant)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("byCategoryTitle")}</CardTitle>
          <CardDescription>{t("byCategoryDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("emptyCategories")}</p>
          ) : (
            <div className="space-y-2">
              {budgets.map((b: Budget) => {
                const draftKey = b.categorie;
                const draftVal = drafts[draftKey];
                const display = draftVal !== undefined ? draftVal : String(b.budget || 0);
                const pct = clampPct(b.pct);
                const couleur = LEVEL_BAR[budgetLevel(b.pct)];
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
                            setMut.mutate(
                              { categorie: b.categorie, mois, budget: v },
                              { onSuccess: () => toast.success(t("toastBudgetUpdated")) },
                            );
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
        {t("tip")}
      </p>
    </div>
  );
}
