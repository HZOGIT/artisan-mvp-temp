import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/modern/shared/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Badge } from "@/modern/shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/modern/shared/ui/dialog";
import {
  Receipt, Plus, Search, Filter, Upload, Download, TrendingUp, TrendingDown,
  FileText, Trash2, Eye, Paperclip, Car,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// Page Dépenses du FRONT NEUF (`/v2/depenses`) — PORT CONFORME de `pages/Depenses.tsx`. JSX à
// l'identique (KPIs + filtres + liste + dialog indemnités km). Plomberie repointée : primitives
// `@/modern/shared/ui`, tRPC partagé, i18n (namespace `depenses`). Navigation via `<Link>` wouter
// (les pages cibles /depenses/nouvelle, /budgets-depenses, /import-releve, /notes-de-frais restent legacy).

const TARIF_KM_DEFAULT = 0.529; // Barème fiscal voiture <= 5 CV, <= 5000 km/an

function eur2(n: number) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

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

const STATUT_KEYS = ["brouillon", "soumise", "approuvee", "rejetee", "remboursee"];

export default function DepensesPage() {
  const { t } = useTranslation("depenses");
  const [mois, setMois] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [categorie, setCategorie] = useState<string>("toutes");
  const [statut, setStatut] = useState<string>("tous");
  const [search, setSearch] = useState("");
  const [isKmOpen, setIsKmOpen] = useState(false);

  // FINDING legacy : `depenses.list` n'a PAS d'`.input()` (cf. depenses.router.ts) → les filtres
  // (catégorie/statut/mois/recherche) que le legacy passait à `useQuery(filters)` étaient IGNORÉS côté
  // serveur (et aucun filtrage client). On appelle donc `useQuery()` sans argument (même résultat,
  // contrat respecté). Les contrôles de filtre restent affichés (parité). À corriger en backend.
  const { data: depenses, refetch } = trpc.depenses.list.useQuery();
  const { data: stats } = trpc.depenses.stats.useQuery({ mois });
  const { data: categories } = trpc.depenses.getCategories.useQuery();
  const { data: budgets } = trpc.depenses.getBudgets.useQuery({ mois });

  const deleteMut = trpc.depenses.delete.useMutation({
    onSuccess: () => {
      toast.success(t("toastDeleted"));
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
      toast.success(t("toastFecDownloaded"));
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
              {t("title")}
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
            <Button
              variant="outline"
              onClick={() => setIsKmOpen(true)}
              className="min-h-[44px] sm:min-h-0"
            >
              <Car className="h-4 w-4 mr-2" /> {t("addKm")}
            </Button>
            <Button asChild className="min-h-[44px] sm:min-h-0">
              <Link to="/depenses/nouvelle">
                <Plus className="h-4 w-4 mr-2" /> {t("add")}
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("kpiTotal")}</CardDescription>
              <CardTitle className="text-2xl">{eurPrecis(stats?.totalMois)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs">
              {stats?.variation !== null && stats?.variation !== undefined && (
                <span className={(stats.variation as number) > 0 ? "text-rose-600" : "text-emerald-600"}>
                  {(stats.variation as number) > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}{" "}
                  {Math.abs(stats.variation as number).toFixed(0)}{t("vsPrevMonth")}
                </span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("kpiToReimburse")}</CardDescription>
              <CardTitle className="text-2xl">{eurPrecis(stats?.aRembourser)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {t("nbDepense", { count: stats?.nbDepensesMois || 0 })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("kpiBudget")}</CardDescription>
              <CardTitle className="text-2xl">{eur(budgetTotal)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              <Link to="/budgets-depenses" className="hover:underline">{t("configure")}</Link>
            </CardContent>
          </Card>

          <Card className={ecart < 0 ? "border-rose-300 bg-rose-50/30" : "border-emerald-200"}>
            <CardHeader className="pb-2">
              <CardDescription>{t("kpiEcart")}</CardDescription>
              <CardTitle className={"text-2xl " + (ecart < 0 ? "text-rose-600" : "text-emerald-600")}>
                {ecart < 0 ? "−" : "+"}{eurPrecis(Math.abs(ecart))}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {t("tvaLabel")} {eur(stats?.tvaRecuperable)}
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
              placeholder={t("searchPlaceholder")}
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
              <SelectItem value="toutes">{t("allCategories")}</SelectItem>
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
              <SelectItem value="tous">{t("allStatuts")}</SelectItem>
              {STATUT_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{t(`statut_${k}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline">
            <Link to="/import-releve">
              <Upload className="h-4 w-4 mr-2" /> {t("importReleve")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/notes-de-frais">
              <FileText className="h-4 w-4 mr-2" /> {t("notesFrais")}
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
            <Download className="h-4 w-4 mr-2" /> {t("exportFec")}
          </Button>
        </CardContent>
      </Card>

      {/* Top catégories + dernières dépenses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" /> {t("byCategory")}
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
              <p className="text-sm text-muted-foreground py-4 text-center">{t("noExpenseMonth")}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("listTitle", { n: depenses?.length || 0 })}</CardTitle>
          </CardHeader>
          <CardContent>
            {!depenses || depenses.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground mb-3">{t("empty")}</p>
                <Button asChild>
                  <Link to="/depenses/nouvelle">
                    <Plus className="h-4 w-4 mr-2" /> {t("addFirst")}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 px-2">{t("thDate")}</th>
                      <th className="py-2 px-2">{t("thFournisseur")}</th>
                      <th className="py-2 px-2 hidden md:table-cell">{t("thCategorie")}</th>
                      <th className="py-2 px-2 text-right">{t("thTTC")}</th>
                      <th className="py-2 px-2 hidden sm:table-cell">{t("thStatut")}</th>
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
                                if (confirm(t("confirmDelete", { numero: d.numero }))) {
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
        aria-label={t("fabAria")}
      >
        <Plus className="h-6 w-6" />
      </Link>

      <IndemniteKmDialog
        open={isKmOpen}
        onOpenChange={setIsKmOpen}
        onSuccess={() => {
          refetch();
          setIsKmOpen(false);
        }}
      />
    </div>
  );
}

// Dialog Indemnités kilométriques — barème fiscal 0.529 €/km par défaut.
function IndemniteKmDialog({
  open, onOpenChange, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation("depenses");
  const [form, setForm] = useState({
    dateDepense: new Date().toISOString().slice(0, 10),
    depart: "",
    arrivee: "",
    kilometres: "",
    tarifKm: String(TARIF_KM_DEFAULT),
    motif: "",
    clientId: undefined as number | undefined,
  });

  const { data: clients } = trpc.clients.list.useQuery();

  const km = parseFloat(form.kilometres || "0");
  const tarif = parseFloat(form.tarifKm || String(TARIF_KM_DEFAULT));
  const montant = +(km * tarif).toFixed(2);

  const creerMut = trpc.depenses.creerIndemniteKm.useMutation({
    onSuccess: () => {
      toast.success(t("toastKmCreated", { montant: eur2(montant) }));
      setForm({
        dateDepense: new Date().toISOString().slice(0, 10),
        depart: "", arrivee: "", kilometres: "",
        tarifKm: String(TARIF_KM_DEFAULT), motif: "", clientId: undefined,
      });
      onSuccess();
    },
    onError: (e) => toast.error(e.message || t("error")),
  });

  const trajetMotif = useMemo(() => {
    const parts: string[] = [];
    if (form.depart || form.arrivee) parts.push(`${form.depart || "?"} → ${form.arrivee || "?"}`);
    if (form.motif) parts.push(form.motif);
    return parts.join(" — ") || t("defaultMotif");
  }, [form.depart, form.arrivee, form.motif, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-blue-600" /> {t("kmTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("kmDesc", { tarif: TARIF_KM_DEFAULT.toFixed(3).replace(".", ",") })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>{t("kmDateLabel")}</Label>
            <Input
              type="date"
              value={form.dateDepense}
              onChange={(e) => setForm({ ...form, dateDepense: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t("departLabel")}</Label>
              <Input
                value={form.depart}
                onChange={(e) => setForm({ ...form, depart: e.target.value })}
                placeholder={t("departPlaceholder")}
              />
            </div>
            <div>
              <Label>{t("arriveeLabel")}</Label>
              <Input
                value={form.arrivee}
                onChange={(e) => setForm({ ...form, arrivee: e.target.value })}
                placeholder={t("arriveePlaceholder")}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t("kmLabel")}</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={form.kilometres}
                onChange={(e) => setForm({ ...form, kilometres: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>{t("tarifLabel")}</Label>
              <Input
                type="number"
                step="0.001"
                value={form.tarifKm}
                onChange={(e) => setForm({ ...form, tarifKm: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{t("motifLabel")}</Label>
            <Textarea
              value={form.motif}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              rows={2}
              placeholder={t("motifPlaceholder")}
            />
          </div>
          <div>
            <Label>{t("clientLabel")}</Label>
            <Select
              value={form.clientId ? String(form.clientId) : "none"}
              onValueChange={(v) =>
                setForm({ ...form, clientId: v === "none" ? undefined : parseInt(v, 10) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("aucun")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("aucun")}</SelectItem>
                {(clients || []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.prenom ? `${c.prenom} ` : ""}{c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200">
            <div className="text-sm">
              {km > 0 ? (
                <>
                  <span className="font-medium">{t("kmValue", { km })}</span>
                  {" × "}
                  <span className="font-medium">{t("tarifValue", { tarif: tarif.toFixed(3).replace(".", ",") })}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{t("saisisKm")}</span>
              )}
            </div>
            <div className="text-xl font-bold text-blue-700">{eur2(montant)}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel", { ns: "common" })}</Button>
          <Button
            onClick={() => {
              if (!km || km <= 0) {
                toast.error(t("toastEnterKm"));
                return;
              }
              creerMut.mutate({
                dateDepense: form.dateDepense,
                kilometres: km,
                tarifKm: tarif,
                motif: trajetMotif,
                clientId: form.clientId,
              });
            }}
            disabled={creerMut.isPending || !km}
          >
            {t("createDepense")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
