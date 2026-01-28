import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Calculator, RefreshCw, BarChart3, LineChart } from "lucide-react";
import { toast } from "sonner";
import Chart from "chart.js/auto";

const moisLabels = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const methodesLabels: Record<string, string> = {
  moyenne_mobile: "Moyenne mobile (3 mois)",
  regression_lineaire: "Régression linéaire",
  saisonnalite: "Saisonnalité",
};

export default function Previsions() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [methode, setMethode] = useState<"moyenne_mobile" | "regression_lineaire" | "saisonnalite">("moyenne_mobile");
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  const { data: historique, isLoading: loadingHistorique } = trpc.previsions.getHistorique.useQuery({ nombreMois: 24 });
  const { data: previsions, isLoading: loadingPrevisions, refetch: refetchPrevisions } = trpc.previsions.getPrevisions.useQuery({ annee });
  const { data: comparaison, refetch: refetchComparaison } = trpc.previsions.getComparaison.useQuery({ annee });

  const calculerPrevisions = trpc.previsions.calculer.useMutation({
    onSuccess: () => {
      toast.success("Prévisions calculées avec succès");
      refetchPrevisions();
      refetchComparaison();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Graphique des prévisions vs réalisé
  useEffect(() => {
    if (!chartRef.current || !comparaison) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    chartInstance.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: comparaison.map(c => moisLabels[c.mois - 1]),
        datasets: [
          {
            label: "Prévisionnel",
            data: comparaison.map(c => c.previsionnel),
            backgroundColor: "rgba(59, 130, 246, 0.5)",
            borderColor: "rgb(59, 130, 246)",
            borderWidth: 1,
          },
          {
            label: "Réalisé",
            data: comparaison.map(c => c.realise),
            backgroundColor: "rgba(34, 197, 94, 0.5)",
            borderColor: "rgb(34, 197, 94)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
          },
          title: {
            display: true,
            text: `Prévisions vs Réalisé - ${annee}`,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: number | string) => `${value} €`,
            },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [comparaison, annee]);

  const totalPrevisionnel = previsions?.reduce((sum, p) => sum + parseFloat(p.caPrevisionnel?.toString() || '0'), 0) || 0;
  const totalRealise = previsions?.reduce((sum, p) => sum + parseFloat(p.caRealise?.toString() || '0'), 0) || 0;
  const ecartTotal = totalRealise - totalPrevisionnel;
  const ecartPct = totalPrevisionnel > 0 ? (ecartTotal / totalPrevisionnel) * 100 : 0;

  const confianceMoyenne = previsions && previsions.length > 0
    ? previsions.reduce((sum, p) => sum + parseFloat(p.confiance?.toString() || '0'), 0) / previsions.length
    : 0;

  if (loadingHistorique || loadingPrevisions) {
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
          <h1 className="text-3xl font-bold tracking-tight">Prévisions de CA</h1>
          <p className="text-muted-foreground">Analysez et prévoyez votre chiffre d'affaires</p>
        </div>
        <div className="flex gap-4">
          <Select value={annee.toString()} onValueChange={(v) => setAnnee(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((a) => (
                <SelectItem key={a} value={a.toString()}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={methode} onValueChange={(v) => setMethode(v as any)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(methodesLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => calculerPrevisions.mutate({ methode })} disabled={calculerPrevisions.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${calculerPrevisions.isPending ? 'animate-spin' : ''}`} />
            Recalculer
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CA Prévisionnel</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPrevisionnel.toLocaleString('fr-FR')} €</div>
            <p className="text-xs text-muted-foreground">Total {annee}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CA Réalisé</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRealise.toLocaleString('fr-FR')} €</div>
            <p className="text-xs text-muted-foreground">Cumulé à ce jour</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Écart</CardTitle>
            {ecartTotal >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${ecartTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {ecartTotal >= 0 ? '+' : ''}{ecartTotal.toLocaleString('fr-FR')} €
            </div>
            <p className="text-xs text-muted-foreground">
              {ecartPct >= 0 ? '+' : ''}{ecartPct.toFixed(1)}% vs prévisions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confiance</CardTitle>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{confianceMoyenne.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground">Indice de fiabilité</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="graphique">
        <TabsList>
          <TabsTrigger value="graphique">Graphique</TabsTrigger>
          <TabsTrigger value="details">Détails mensuels</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="graphique" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Prévisions vs Réalisé</CardTitle>
              <CardDescription>Comparaison mensuelle pour {annee}</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ height: "400px" }}>
                <canvas ref={chartRef}></canvas>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Détails des prévisions</CardTitle>
              <CardDescription>Méthode : {methodesLabels[methode]}</CardDescription>
            </CardHeader>
            <CardContent>
              {previsions && previsions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">Mois</th>
                        <th className="text-right py-3 px-4">Prévisionnel</th>
                        <th className="text-right py-3 px-4">Réalisé</th>
                        <th className="text-right py-3 px-4">Écart</th>
                        <th className="text-right py-3 px-4">Confiance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previsions.map((p) => {
                        const previsionnel = parseFloat(p.caPrevisionnel?.toString() || '0');
                        const realise = parseFloat(p.caRealise?.toString() || '0');
                        const ecart = realise - previsionnel;
                        const confiance = parseFloat(p.confiance?.toString() || '0');
                        
                        return (
                          <tr key={p.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-4 font-medium">{moisLabels[p.mois - 1]}</td>
                            <td className="text-right py-3 px-4">{previsionnel.toLocaleString('fr-FR')} €</td>
                            <td className="text-right py-3 px-4">
                              {realise > 0 ? `${realise.toLocaleString('fr-FR')} €` : '-'}
                            </td>
                            <td className={`text-right py-3 px-4 ${ecart >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {realise > 0 ? `${ecart >= 0 ? '+' : ''}${ecart.toLocaleString('fr-FR')} €` : '-'}
                            </td>
                            <td className="text-right py-3 px-4">
                              <span className={`px-2 py-1 rounded text-sm ${
                                confiance >= 70 ? 'bg-green-100 text-green-800' :
                                confiance >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {confiance.toFixed(0)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-muted/50">
                        <td className="py-3 px-4">Total</td>
                        <td className="text-right py-3 px-4">{totalPrevisionnel.toLocaleString('fr-FR')} €</td>
                        <td className="text-right py-3 px-4">{totalRealise.toLocaleString('fr-FR')} €</td>
                        <td className={`text-right py-3 px-4 ${ecartTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {ecartTotal >= 0 ? '+' : ''}{ecartTotal.toLocaleString('fr-FR')} €
                        </td>
                        <td className="text-right py-3 px-4">{confianceMoyenne.toFixed(0)}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucune prévision disponible</p>
                  <p className="text-sm mt-2">Cliquez sur "Recalculer" pour générer les prévisions</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historique" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique du CA</CardTitle>
              <CardDescription>Données des 24 derniers mois</CardDescription>
            </CardHeader>
            <CardContent>
              {historique && historique.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">Période</th>
                        <th className="text-right py-3 px-4">CA Total</th>
                        <th className="text-right py-3 px-4">Nb Factures</th>
                        <th className="text-right py-3 px-4">Nb Clients</th>
                        <th className="text-right py-3 px-4">Panier Moyen</th>
                        <th className="text-right py-3 px-4">Taux Conversion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historique.map((h) => (
                        <tr key={h.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium">
                            {moisLabels[h.mois - 1]} {h.annee}
                          </td>
                          <td className="text-right py-3 px-4">
                            {parseFloat(h.caTotal?.toString() || '0').toLocaleString('fr-FR')} €
                          </td>
                          <td className="text-right py-3 px-4">{h.nombreFactures}</td>
                          <td className="text-right py-3 px-4">{h.nombreClients}</td>
                          <td className="text-right py-3 px-4">
                            {parseFloat(h.panierMoyen?.toString() || '0').toLocaleString('fr-FR')} €
                          </td>
                          <td className="text-right py-3 px-4">
                            {parseFloat(h.tauxConversion?.toString() || '0').toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun historique disponible</p>
                  <p className="text-sm mt-2">L'historique sera généré automatiquement lors du calcul des prévisions</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
