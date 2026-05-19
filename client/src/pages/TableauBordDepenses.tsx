import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import {
  BarChart3, TrendingUp, TrendingDown, AlertTriangle, Receipt,
  ArrowRight, Sparkles, AlertCircle, Wallet, FileDown,
} from "lucide-react";
import { generateRapportDepensesPDF } from "@/lib/generateRapportDepensesPDF";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function TableauBordDepenses() {
  const [mois, setMois] = useState<string>(() => new Date().toISOString().slice(0, 7));

  const { data: stats } = trpc.depenses.stats.useQuery({ mois });
  const { data: budgets } = trpc.depenses.getBudgets.useQuery({ mois });
  const { data: categories } = trpc.depenses.getCategories.useQuery();
  const { data: artisan } = trpc.artisan.getProfile.useQuery();

  const [pdfBusy, setPdfBusy] = useState(false);
  async function genererRapportPDF() {
    if (!stats) {
      toast.error("Les statistiques ne sont pas encore chargées");
      return;
    }
    setPdfBusy(true);
    try {
      await generateRapportDepensesPDF({
        mois,
        artisanNom: artisan?.nomEntreprise || "Operioz",
        stats: {
          totalMois: Number(stats.totalMois || 0),
          totalAnnee: Number(stats.totalAnnee || 0),
          tvaRecuperable: Number(stats.tvaRecuperable || 0),
          aRembourser: Number(stats.aRembourser || 0),
          nbDepensesMois: Number(stats.nbDepensesMois || 0),
          variation: stats.variation,
          parCategorie: stats.parCategorie as any,
          topDepenses: stats.topDepenses as any,
        },
        budgets: (budgets || []).map((b: any) => ({
          categorie: b.categorie,
          budget: Number(b.budget || 0),
          reel: Number(b.reel || 0),
          ecart: Number(b.ecart || 0),
          pct: Number(b.pct || 0),
        })),
      });
      toast.success("Rapport PDF téléchargé");
    } catch (e: any) {
      toast.error(e?.message || "Erreur génération PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  // Donut data : par categorie avec couleur de la categorie.
  const donutData = useMemo(() => {
    if (!stats?.parCategorie) return [];
    return (stats.parCategorie as any[]).map((c) => {
      const cat = (categories || []).find((x: any) => x.nom === c.categorie);
      return {
        name: c.categorie,
        value: Number(c.total || 0),
        color: cat?.couleur || "#94a3b8",
      };
    });
  }, [stats, categories]);

  // Bar evolution 6 mois
  const barData = useMemo(() => {
    if (!stats?.parMois) return [];
    return (stats.parMois as any[]).map((m) => ({
      mois: format(new Date(m.mois + "-01"), "MMM", { locale: fr }),
      total: Number(m.total || 0),
    }));
  }, [stats]);

  // Budget : alertes catégories en depassement
  const alertes = useMemo(() => {
    if (!budgets) return [];
    return (budgets as any[]).filter((b) => b.budget > 0 && b.pct >= 80);
  }, [budgets]);

  // Projection fin de mois : extrapolation lineaire.
  const projection = useMemo(() => {
    if (!stats?.totalMois) return null;
    const now = new Date();
    const [y, m] = mois.split("-").map(Number);
    if (y !== now.getFullYear() || m !== now.getMonth() + 1) return null;
    const jour = now.getDate();
    const joursDansLeMois = new Date(y, m, 0).getDate();
    return (stats.totalMois as number) * (joursDansLeMois / jour);
  }, [stats, mois]);

  const totalBudget = (budgets || []).reduce((s: number, b: any) => s + Number(b.budget || 0), 0);
  const pctBudget = totalBudget > 0 ? Math.round(((stats?.totalMois || 0) / totalBudget) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-violet-600" /> Tableau de bord dépenses
          </h1>
          <p className="text-muted-foreground mt-1">
            {format(new Date(mois + "-01"), "MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className="w-[160px]" />
          <Button
            onClick={genererRapportPDF}
            disabled={pdfBusy}
            variant="outline"
            className="min-h-[44px] sm:min-h-0"
          >
            <FileDown className="h-4 w-4 mr-2" />
            {pdfBusy ? "Génération…" : "Rapport PDF"}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total du mois</CardDescription>
            <CardTitle className="text-2xl">{eur(stats?.totalMois)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs">
            {stats?.variation !== null && stats?.variation !== undefined && (
              <span className={(stats.variation as number) > 0 ? "text-rose-600" : "text-emerald-600"}>
                {(stats.variation as number) > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}{" "}
                {Math.abs(stats.variation as number).toFixed(0)}% vs mois précédent
              </span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>À rembourser</CardDescription>
            <CardTitle className="text-2xl">{eur(stats?.aRembourser)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            <Wallet className="h-3 w-3 inline mr-1" /> {stats?.nbDepensesMois || 0} dépense{(stats?.nbDepensesMois || 0) > 1 ? "s" : ""}
          </CardContent>
        </Card>

        <Card className={pctBudget > 100 ? "border-rose-300 bg-rose-50/30" : pctBudget > 75 ? "border-orange-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Budget consommé</CardDescription>
            <CardTitle className="text-2xl">{pctBudget}%</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {eur(totalBudget - (stats?.totalMois || 0))} restants sur {eur(totalBudget)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total année</CardDescription>
            <CardTitle className="text-2xl">{eur(stats?.totalAnnee)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {new Date(mois + "-01").getFullYear()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>TVA récupérable</CardDescription>
            <CardTitle className="text-2xl">{eur(stats?.tvaRecuperable)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">À déduire ce mois</CardContent>
        </Card>

        {projection !== null && (
          <Card className={projection > totalBudget && totalBudget > 0 ? "border-orange-300" : ""}>
            <CardHeader className="pb-2">
              <CardDescription>Projection fin de mois</CardDescription>
              <CardTitle className="text-2xl">{eur(projection)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 inline mr-1" /> Tendance actuelle
            </CardContent>
          </Card>
        )}
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par catégorie</CardTitle>
            <CardDescription>Mois courant</CardDescription>
          </CardHeader>
          <CardContent>
            {donutData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aucune dépense ce mois.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {donutData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => eur(v)} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Évolution 6 derniers mois</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Pas encore de données.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mois" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: any) => eur(v)} />
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
            <CardTitle className="text-base flex items-center gap-2 text-orange-900">
              <AlertTriangle className="h-5 w-5" /> Alertes budget
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertes.map((b: any) => (
              <div key={b.categorie} className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: b.couleur }} />
                <span className="text-sm flex-1 truncate">{b.categorie}</span>
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden max-w-[160px]">
                  <div
                    className={"h-full " + (b.pct > 100 ? "bg-rose-500" : "bg-orange-500")}
                    style={{ width: `${Math.min(100, b.pct)}%` }}
                  />
                </div>
                <Badge variant={b.pct > 100 ? "destructive" : "default"}>{b.pct}%</Badge>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {eur(b.reel)} / {eur(b.budget)}
                </span>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/budgets-depenses">
                Voir tous les budgets <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Top dépenses + fournisseurs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 dépenses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(stats?.topDepenses || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Pas de dépense.</p>
            ) : (
              (stats?.topDepenses || []).map((d: any) => (
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
          <CardHeader>
            <CardTitle className="text-base">Top 3 fournisseurs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(stats?.topFournisseurs || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Pas de fournisseur.</p>
            ) : (
              (stats?.topFournisseurs || []).map((f: any) => (
                <div key={f.fournisseur} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{f.fournisseur}</div>
                    <div className="text-xs text-muted-foreground">{f.nb} dépense{f.nb > 1 ? "s" : ""}</div>
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
        <Button asChild variant="outline">
          <Link to="/depenses">
            <Receipt className="h-4 w-4 mr-2" /> Voir les dépenses
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/budgets-depenses">
            <BarChart3 className="h-4 w-4 mr-2" /> Configurer les budgets
          </Link>
        </Button>
      </div>
    </div>
  );
}
