import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Receipt, Plus, Search, Filter, Upload, Download, TrendingUp, TrendingDown,
  FileText, Trash2, Eye, AlertCircle, Paperclip,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function eurPrecis(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const STATUT_STYLES: Record<string, string> = {
  brouillon: "bg-slate-100 text-slate-700",
  soumise: "bg-blue-100 text-blue-700",
  approuvee: "bg-emerald-100 text-emerald-700",
  rejetee: "bg-rose-100 text-rose-700",
  remboursee: "bg-purple-100 text-purple-700",
};

export default function Depenses() {
  const [mois, setMois] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [categorie, setCategorie] = useState<string>("toutes");
  const [statut, setStatut] = useState<string>("tous");
  const [search, setSearch] = useState("");

  const filters = useMemo(() => {
    const [y, m] = mois.split("-").map(Number);
    const dateDebut = `${mois}-01`;
    const dateFin = new Date(y, m, 0).toISOString().slice(0, 10);
    return {
      categorie: categorie === "toutes" ? undefined : categorie,
      statut: statut === "tous" ? undefined : statut,
      dateDebut,
      dateFin,
      search: search || undefined,
    };
  }, [mois, categorie, statut, search]);

  const { data: depenses, refetch } = trpc.depenses.list.useQuery(filters);
  const { data: stats } = trpc.depenses.stats.useQuery({ mois });
  const { data: categories } = trpc.depenses.getCategories.useQuery();
  const { data: budgets } = trpc.depenses.getBudgets.useQuery({ mois });

  const deleteMut = trpc.depenses.delete.useMutation({
    onSuccess: () => {
      toast.success("Dépense supprimée");
      refetch();
    },
  });

  const exportFecMut = trpc.depenses.exportFecAchats.useMutation({
    onSuccess: (res) => {
      const blob = new Blob([res.contenu], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FEC-achats-${mois}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export FEC téléchargé");
    },
  });

  const budgetTotal = useMemo(
    () => (budgets || []).reduce((s: number, b: any) => s + Number(b.budget || 0), 0),
    [budgets]
  );
  const ecart = budgetTotal - (stats?.totalMois || 0);

  return (
    <div className="space-y-6">
      {/* Header + KPIs */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Receipt className="h-7 w-7 text-violet-600" />
              Dépenses
            </h1>
            <p className="text-muted-foreground mt-1">
              {format(new Date(mois + "-01"), "MMMM yyyy", { locale: fr })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              type="month"
              value={mois}
              onChange={(e) => setMois(e.target.value)}
              className="w-[160px]"
            />
            <Button asChild className="min-h-[44px] sm:min-h-0">
              <Link to="/depenses/nouvelle">
                <Plus className="h-4 w-4 mr-2" /> Ajouter
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total du mois</CardDescription>
              <CardTitle className="text-2xl">{eurPrecis(stats?.totalMois)}</CardTitle>
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
              <CardTitle className="text-2xl">{eurPrecis(stats?.aRembourser)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {stats?.nbDepensesMois || 0} dépense{(stats?.nbDepensesMois || 0) > 1 ? "s" : ""}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Budget</CardDescription>
              <CardTitle className="text-2xl">{eur(budgetTotal)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              <Link to="/budgets-depenses" className="hover:underline">Configurer →</Link>
            </CardContent>
          </Card>

          <Card className={ecart < 0 ? "border-rose-300 bg-rose-50/30" : "border-emerald-200"}>
            <CardHeader className="pb-2">
              <CardDescription>Écart vs budget</CardDescription>
              <CardTitle className={"text-2xl " + (ecart < 0 ? "text-rose-600" : "text-emerald-600")}>
                {ecart < 0 ? "−" : "+"}{eurPrecis(Math.abs(ecart))}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              TVA récup : {eur(stats?.tvaRecuperable)}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Fournisseur, description, numéro…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categorie} onValueChange={setCategorie}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="toutes">Toutes catégories</SelectItem>
              {(categories || []).map((c: any) => (
                <SelectItem key={c.id} value={c.nom}>
                  {c.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous statuts</SelectItem>
              <SelectItem value="brouillon">Brouillon</SelectItem>
              <SelectItem value="soumise">Soumise</SelectItem>
              <SelectItem value="approuvee">Approuvée</SelectItem>
              <SelectItem value="rejetee">Rejetée</SelectItem>
              <SelectItem value="remboursee">Remboursée</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild variant="outline">
            <Link to="/import-releve">
              <Upload className="h-4 w-4 mr-2" /> Import relevé
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/notes-de-frais">
              <FileText className="h-4 w-4 mr-2" /> Notes de frais
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const [y, m] = mois.split("-").map(Number);
              const debut = `${mois}-01`;
              const fin = new Date(y, m, 0).toISOString().slice(0, 10);
              exportFecMut.mutate({ dateDebut: debut, dateFin: fin });
            }}
            disabled={exportFecMut.isPending}
          >
            <Download className="h-4 w-4 mr-2" /> Export FEC
          </Button>
        </CardContent>
      </Card>

      {/* Top catégories + dernières dépenses (mobile : 1 col, desktop : 2 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" /> Par catégorie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(stats?.parCategorie || []).slice(0, 6).map((c: any) => {
              const cat = (categories || []).find((x: any) => x.nom === c.categorie);
              return (
                <div key={c.categorie} className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat?.couleur || "#94a3b8" }}
                  />
                  <span className="text-sm flex-1 truncate">{c.categorie}</span>
                  <span className="text-sm font-medium">{eur(c.total)}</span>
                </div>
              );
            })}
            {(stats?.parCategorie || []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Pas de dépense ce mois.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Liste des dépenses ({depenses?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {!depenses || depenses.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground mb-3">Aucune dépense pour cette période</p>
                <Button asChild>
                  <Link to="/depenses/nouvelle">
                    <Plus className="h-4 w-4 mr-2" /> Ajouter ma première dépense
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Fournisseur</th>
                      <th className="py-2 px-2 hidden md:table-cell">Catégorie</th>
                      <th className="py-2 px-2 text-right">TTC</th>
                      <th className="py-2 px-2 hidden sm:table-cell">Statut</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {depenses.map((d: any) => {
                      const cat = (categories || []).find((x: any) => x.nom === d.categorie);
                      return (
                        <tr key={d.id} className="border-b last:border-b-0 hover:bg-muted/40">
                          <td className="py-2 px-2 whitespace-nowrap">
                            {d.date_depense ? format(new Date(d.date_depense), "dd MMM", { locale: fr }) : "—"}
                          </td>
                          <td className="py-2 px-2">
                            <div className="font-medium truncate max-w-[200px]">
                              {d.fournisseur || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px] md:hidden">
                              {d.categorie}
                            </div>
                          </td>
                          <td className="py-2 px-2 hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: cat?.couleur || "#94a3b8" }}
                              />
                              <span className="text-xs">{d.categorie}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-medium whitespace-nowrap">
                            {eur(d.montant_ttc)}
                          </td>
                          <td className="py-2 px-2 hidden sm:table-cell">
                            <Badge className={STATUT_STYLES[d.statut] || ""}>{d.statut}</Badge>
                            {d.justificatif_url && (
                              <Paperclip className="h-3 w-3 inline ml-1 text-muted-foreground" />
                            )}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                              <Link to={`/depenses/nouvelle?edit=${d.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (confirm(`Supprimer la dépense ${d.numero} ?`)) {
                                  deleteMut.mutate({ id: d.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FAB mobile */}
      <Link
        to="/depenses/nouvelle"
        className="md:hidden fixed bottom-20 right-4 h-14 w-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-lg"
        aria-label="Nouvelle dépense"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}
