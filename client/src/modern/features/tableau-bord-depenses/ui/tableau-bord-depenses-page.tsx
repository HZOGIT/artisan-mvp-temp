import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, Receipt, ArrowRight, Sparkles, Wallet, FileDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Badge } from "@/modern/shared/ui/badge";
import { generateRapportDepensesPDF } from "@/lib/generateRapportDepensesPDF";
import { useTableauBordDepenses } from "../application/use-tableau-bord-depenses";
import { eur, donutData, barData, alertesBudget, totalBudget, pctBudget, projection } from "../domain/tableau-bord-depenses";

// Page `tableau-bord-depenses` — migration clean-archi de `pages/TableauBordDepenses.tsx`. Markup à
// l'identique (recharts conservé). tRPC encapsulé dans `use-tableau-bord-depenses`, dérivations en domain.
const fmtTooltip = (v: number | string) => eur(v);

export default function TableauBordDepensesPage() {
  const { t } = useTranslation("tableauBordDepenses");
  const [mois, setMois] = useState(() => new Date().toISOString().slice(0, 7));
  const { stats, budgets, categories, artisan } = useTableauBordDepenses(mois);
  const [pdfBusy, setPdfBusy] = useState(false);

  const donut = useMemo(() => donutData(stats, categories), [stats, categories]);
  const bars = useMemo(() => barData(stats, (m) => format(new Date(m + "-01"), "MMM", { locale: fr })), [stats]);
  const alertes = useMemo(() => alertesBudget(budgets), [budgets]);
  const totalBudgetVal = totalBudget(budgets);
  const totalMois = Number(stats?.totalMois || 0);
  const pct = pctBudget(totalMois, totalBudgetVal);
  const proj = projection(totalMois, mois);

  async function genererRapportPDF() {
    if (!stats) { toast.error(t("errStats")); return; }
    setPdfBusy(true);
    try {
      await generateRapportDepensesPDF({
        mois,
        artisanNom: artisan?.nomEntreprise || "Operioz",
        stats: {
          totalMois: Number(stats.totalMois || 0), totalAnnee: Number(stats.totalAnnee || 0),
          tvaRecuperable: Number(stats.tvaRecuperable || 0), aRembourser: Number(stats.aRembourser || 0),
          nbDepensesMois: Number(stats.nbDepensesMois || 0), variation: stats.variation,
          parCategorie: (stats.parCategorie ?? []).map((c) => ({ categorie: c.categorie, total: Number(c.total || 0), nb: c.nb })),
          topDepenses: (stats.topDepenses ?? []).map((d) => ({ numero: d.numero, fournisseur: d.fournisseur ?? "", categorie: d.categorie, montant_ttc: Number(d.montant_ttc || 0), date_depense: d.date_depense })),
        },
        budgets: budgets.map((b) => ({ categorie: b.categorie, budget: Number(b.budget || 0), reel: Number(b.reel || 0), ecart: Number(b.ecart || 0), pct: Number(b.pct || 0) })),
      });
      toast.success(t("toastPdf"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errPdf"));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-violet-600" /> {t("titre")}
          </h1>
          <p className="text-muted-foreground mt-1">{format(new Date(mois + "-01"), "MMMM yyyy", { locale: fr })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className="w-[160px]" />
          <Button onClick={genererRapportPDF} disabled={pdfBusy} variant="outline" className="min-h-[44px] sm:min-h-0">
            <FileDown className="h-4 w-4 mr-2" />{pdfBusy ? t("generation") : t("rapportPdf")}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("totalMois")}</CardDescription>
            <CardTitle className="text-2xl">{eur(stats?.totalMois)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs">
            {stats?.variation !== null && stats?.variation !== undefined && (
              <span className={stats.variation > 0 ? "text-rose-600" : "text-emerald-600"}>
                {stats.variation > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}{" "}
                {t("vsMoisPrecedent", { pct: Math.abs(stats.variation).toFixed(0) })}
              </span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("aRembourser")}</CardDescription>
            <CardTitle className="text-2xl">{eur(stats?.aRembourser)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            <Wallet className="h-3 w-3 inline mr-1" /> {t("depensesCount", { count: stats?.nbDepensesMois || 0 })}
          </CardContent>
        </Card>

        <Card className={pct > 100 ? "border-rose-300 bg-rose-50/30" : pct > 75 ? "border-orange-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>{t("budgetConsomme")}</CardDescription>
            <CardTitle className="text-2xl">{pct}%</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {t("restantsSur", { restants: eur(totalBudgetVal - totalMois), total: eur(totalBudgetVal) })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("totalAnnee")}</CardDescription>
            <CardTitle className="text-2xl">{eur(stats?.totalAnnee)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{new Date(mois + "-01").getFullYear()}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("tvaRecuperable")}</CardDescription>
            <CardTitle className="text-2xl">{eur(stats?.tvaRecuperable)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{t("aDeduire")}</CardContent>
        </Card>

        {proj !== null && (
          <Card className={proj > totalBudgetVal && totalBudgetVal > 0 ? "border-orange-300" : ""}>
            <CardHeader className="pb-2">
              <CardDescription>{t("projection")}</CardDescription>
              <CardTitle className="text-2xl">{eur(proj)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 inline mr-1" /> {t("tendanceActuelle")}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("repartitionCategorie")}</CardTitle>
            <CardDescription>{t("moisCourant")}</CardDescription>
          </CardHeader>
          <CardContent>
            {donut.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{t("aucuneDepense")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {donut.map((entry, idx) => (<Cell key={idx} fill={entry.color} />))}
                  </Pie>
                  <Tooltip formatter={fmtTooltip} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("evolution6Mois")}</CardTitle></CardHeader>
          <CardContent>
            {bars.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{t("pasDeDonnees")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={bars}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mois" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={fmtTooltip} />
                  <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alertes budget */}
      {alertes.length > 0 && (
        <Card className="border-orange-300 bg-orange-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-orange-900"><AlertTriangle className="h-5 w-5" /> {t("alertesBudget")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertes.map((b) => (
              <div key={b.categorie} className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: b.couleur ?? undefined }} />
                <span className="text-sm flex-1 truncate">{b.categorie}</span>
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden max-w-[160px]">
                  <div className={"h-full " + (Number(b.pct) > 100 ? "bg-rose-500" : "bg-orange-500")} style={{ width: `${Math.min(100, Number(b.pct))}%` }} />
                </div>
                <Badge variant={Number(b.pct) > 100 ? "destructive" : "default"}>{b.pct}%</Badge>
                <span className="text-xs text-muted-foreground hidden sm:inline">{eur(b.reel)} / {eur(b.budget)}</span>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <a href="/budgets-depenses">{t("voirTousBudgets")} <ArrowRight className="h-3 w-3 ml-1" /></a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Top dépenses + fournisseurs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("top5Depenses")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(stats?.topDepenses ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("pasDeDepense")}</p>
            ) : (
              (stats?.topDepenses ?? []).map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <Receipt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{d.fournisseur || d.numero}</div>
                    <div className="text-xs text-muted-foreground">{d.categorie}</div>
                  </div>
                  <span className="font-medium">{eur(d.montant_ttc)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("top3Fournisseurs")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(stats?.topFournisseurs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("pasDeFournisseur")}</p>
            ) : (
              (stats?.topFournisseurs ?? []).map((f) => (
                <div key={f.fournisseur} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{f.fournisseur}</div>
                    <div className="text-xs text-muted-foreground">{t("depensesCount", { count: f.nb })}</div>
                  </div>
                  <span className="font-medium">{eur(f.total)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button asChild variant="outline"><a href="/depenses"><Receipt className="h-4 w-4 mr-2" /> {t("voirDepenses")}</a></Button>
        <Button asChild variant="outline"><a href="/budgets-depenses"><BarChart3 className="h-4 w-4 mr-2" /> {t("configurerBudgets")}</a></Button>
      </div>
    </div>
  );
}
