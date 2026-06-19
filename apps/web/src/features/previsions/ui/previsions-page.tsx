import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Calculator, RefreshCw, BarChart3, LineChart } from "lucide-react";
import Chart from "chart.js/auto";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { usePrevisions } from "../application/use-previsions";
import { MOIS_LABELS, METHODES, num, totalPrevisionnel, totalRealise, confianceMoyenne, ecartPct, confianceClass, type Methode } from "../domain/previsions";

/*
 * Page `previsions` (prévisions de CA) — migration clean-archi de `pages/Previsions.tsx`. Markup à
 * l'identique (Chart.js conservé). tRPC encapsulé dans `use-previsions`, agrégats purs en domain.
 */
export default function PrevisionsPage() {
  const { t } = useTranslation("previsions");
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [methode, setMethode] = useState<Methode>("moyenne_mobile");
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const { historique, previsions, comparaison, isLoading, calculer } = usePrevisions(annee);

  useEffect(() => {
    if (!chartRef.current || comparaison.length === 0) return;
    chartInstance.current?.destroy();
    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    chartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: comparaison.map((c) => MOIS_LABELS[c.mois - 1]),
        datasets: [
          { label: t("chartPrevisionnel"), data: comparaison.map((c) => num(c.caPrevisionnel)), backgroundColor: "rgba(59, 130, 246, 0.5)", borderColor: "rgb(59, 130, 246)", borderWidth: 1 },
          { label: t("chartRealise"), data: comparaison.map((c) => num(c.caRealise)), backgroundColor: "rgba(34, 197, 94, 0.5)", borderColor: "rgb(34, 197, 94)", borderWidth: 1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" }, title: { display: true, text: t("chartTitle", { annee }) } },
        scales: { y: { beginAtZero: true, ticks: { callback: (value) => `${value} €` } } },
      },
    });

    return () => { chartInstance.current?.destroy(); };
  }, [comparaison, annee, t]);

  const prevTotal = totalPrevisionnel(previsions);
  const realiseTotal = totalRealise(previsions);
  const ecartTotal = realiseTotal - prevTotal;
  const pct = ecartPct(prevTotal, realiseTotal);
  const confiance = confianceMoyenne(previsions);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground">{t("sousTitre")}</p>
        </div>
        <div className="flex gap-4">
          <Select value={annee.toString()} onValueChange={(v) => setAnnee(parseInt(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((a) => (<SelectItem key={a} value={a.toString()}>{a}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={methode} onValueChange={(v) => setMethode(v as Methode)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METHODES.map((m) => (<SelectItem key={m} value={m}>{t(`methode.${m}`)}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button onClick={() => calculer.mutate({ methode }, { onSuccess: () => toast.success(t("toastCalcule")), onError: (e) => toast.error(e.message) })} disabled={calculer.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${calculer.isPending ? "animate-spin" : ""}`} />{t("recalculer")}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpiPrevisionnel")}</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{prevTotal.toLocaleString("fr-FR")} €</div>
            <p className="text-xs text-muted-foreground">{t("kpiTotal", { annee })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpiRealise")}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{realiseTotal.toLocaleString("fr-FR")} €</div>
            <p className="text-xs text-muted-foreground">{t("kpiCumule")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpiEcart")}</CardTitle>
            {ecartTotal >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${ecartTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
              {ecartTotal >= 0 ? "+" : ""}{ecartTotal.toLocaleString("fr-FR")} €
            </div>
            <p className="text-xs text-muted-foreground">{t("kpiEcartPct", { pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}` })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpiConfiance")}</CardTitle>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{confiance.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground">{t("kpiFiabilite")}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="graphique">
        <TabsList>
          <TabsTrigger value="graphique">{t("tabGraphique")}</TabsTrigger>
          <TabsTrigger value="details">{t("tabDetails")}</TabsTrigger>
          <TabsTrigger value="historique">{t("tabHistorique")}</TabsTrigger>
        </TabsList>

        <TabsContent value="graphique" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("graphiqueTitre")}</CardTitle>
              <CardDescription>{t("graphiqueDesc", { annee })}</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ height: "400px" }}><canvas ref={chartRef}></canvas></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("detailsTitre")}</CardTitle>
              <CardDescription>{t("detailsMethode", { methode: t(`methode.${methode}`) })}</CardDescription>
            </CardHeader>
            <CardContent>
              {previsions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">{t("colMois")}</th>
                        <th className="text-right py-3 px-4">{t("colPrevisionnel")}</th>
                        <th className="text-right py-3 px-4">{t("colRealise")}</th>
                        <th className="text-right py-3 px-4">{t("colEcart")}</th>
                        <th className="text-right py-3 px-4">{t("colConfiance")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previsions.map((p) => {
                        const previsionnel = num(p.caPrevisionnel);
                        const realise = num(p.caRealise);
                        const ecart = realise - previsionnel;
                        const conf = num(p.confiance);
                        return (
                          <tr key={p.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-4 font-medium">{MOIS_LABELS[p.mois - 1]}</td>
                            <td className="text-right py-3 px-4">{previsionnel.toLocaleString("fr-FR")} €</td>
                            <td className="text-right py-3 px-4">{realise > 0 ? `${realise.toLocaleString("fr-FR")} €` : "-"}</td>
                            <td className={`text-right py-3 px-4 ${ecart >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {realise > 0 ? `${ecart >= 0 ? "+" : ""}${ecart.toLocaleString("fr-FR")} €` : "-"}
                            </td>
                            <td className="text-right py-3 px-4">
                              <span className={`px-2 py-1 rounded text-sm ${confianceClass(conf)}`}>{conf.toFixed(0)}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-muted/50">
                        <td className="py-3 px-4">{t("total")}</td>
                        <td className="text-right py-3 px-4">{prevTotal.toLocaleString("fr-FR")} €</td>
                        <td className="text-right py-3 px-4">{realiseTotal.toLocaleString("fr-FR")} €</td>
                        <td className={`text-right py-3 px-4 ${ecartTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {ecartTotal >= 0 ? "+" : ""}{ecartTotal.toLocaleString("fr-FR")} €
                        </td>
                        <td className="text-right py-3 px-4">{confiance.toFixed(0)}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t("aucunePrevision")}</p>
                  <p className="text-sm mt-2">{t("aucunePrevisionAstuce")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historique" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("historiqueTitre")}</CardTitle>
              <CardDescription>{t("historiqueDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {historique.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">{t("colPeriode")}</th>
                        <th className="text-right py-3 px-4">{t("colCaTotal")}</th>
                        <th className="text-right py-3 px-4">{t("colNbFactures")}</th>
                        <th className="text-right py-3 px-4">{t("colNbClients")}</th>
                        <th className="text-right py-3 px-4">{t("colPanier")}</th>
                        <th className="text-right py-3 px-4">{t("colConversion")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historique.map((h) => (
                        <tr key={h.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium">{MOIS_LABELS[h.mois - 1]} {h.annee}</td>
                          <td className="text-right py-3 px-4">{num(h.caTotal).toLocaleString("fr-FR")} €</td>
                          <td className="text-right py-3 px-4">{h.nombreFactures}</td>
                          <td className="text-right py-3 px-4">{h.nombreClients}</td>
                          <td className="text-right py-3 px-4">{num(h.panierMoyen).toLocaleString("fr-FR")} €</td>
                          <td className="text-right py-3 px-4">{num(h.tauxConversion).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t("aucunHistorique")}</p>
                  <p className="text-sm mt-2">{t("aucunHistoriqueAstuce")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
