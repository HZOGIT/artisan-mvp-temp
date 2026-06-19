import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertCircle, Clock, TrendingUp, FileText, CreditCard, Activity, BarChart3, Calendar, ArrowUpRight, ArrowDownRight, Zap, Database, Filter, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Progress } from "@/shared/ui/progress";
import { useSyncComptable } from "../application/use-sync-comptable";
import { computeStats, computeChartData, statutVariant, typeLabelKey, type Periode, type StatutFiltre, type TypeFiltre } from "../domain/sync-comptable";

/*
 * Page `tableau-bord-sync-comptable` — migration clean-archi de `pages/TableauBordSyncComptable.tsx`.
 * Markup à l'identique. Toute l'agrégation (stats/chart) vit en domain (pur, testé). 0 `any`.
 */
const STATUT_ICON: Record<string, typeof CheckCircle2> = { en_cours: RefreshCw, termine: CheckCircle2, succes: CheckCircle2, erreur: AlertCircle, en_attente: Clock };

export default function SyncComptablePage() {
  const { t } = useTranslation("syncComptable");
  const { syncStatus, syncLogs, pendingItems, exports, lancerSync } = useSyncComptable();
  const [periode, setPeriode] = useState<Periode>("30j");
  const [statut, setStatut] = useState<StatutFiltre>("tous");
  const [type, setType] = useState<TypeFiltre>("tous");

  const filters = useMemo(() => ({ periode, statut, type }), [periode, statut, type]);
  const stats = useMemo(() => computeStats(syncLogs, exports, filters), [syncLogs, exports, filters]);
  const chartData = useMemo(() => computeChartData(syncLogs, exports, filters), [syncLogs, exports, filters]);
  const maxSyncs = Math.max(...chartData.map((d) => d.syncs), 1);
  const hasActiveFilters = statut !== "tous" || type !== "tous";

  const StatutBadge = ({ statut: s }: { statut: string }) => {
    const Icon = STATUT_ICON[s] ?? Clock;
    return <Badge variant={statutVariant(s)} className="flex items-center gap-1"><Icon className={`h-3 w-3 ${s === "en_cours" ? "animate-spin" : ""}`} />{t(`statut.${s}`, s)}</Badge>;
  };
  const TypeBadge = ({ sourceType }: { sourceType: string }) => (
    <Badge variant="outline" className={sourceType === "export" ? "bg-purple-50" : ""}>{t(typeLabelKey(sourceType))}</Badge>
  );

  const enAttenteTotal = (pendingItems?.facturesEnAttente || 0) + (pendingItems?.paiementsEnAttente || 0);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground">{t("sousTitre")}</p>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={() => lancerSync.mutate(undefined, { onSuccess: (data) => toast.success(data.message || t("toastSyncOk", { n: data.nbItems })), onError: (e) => toast.error(e.message) })} disabled={lancerSync.isPending}>
            {lancerSync.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t("synchronisation")}</> : <><Zap className="h-4 w-4 mr-2" />{t("synchroniser")}</>}
          </Button>
        </div>
      </div>

      {/* Barre de filtres */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("filtres")}</span>
            </div>
            <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
              <SelectTrigger className="w-[150px]"><Calendar className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7j">{t("periode7j")}</SelectItem>
                <SelectItem value="30j">{t("periode30j")}</SelectItem>
                <SelectItem value="90j">{t("periode90j")}</SelectItem>
                <SelectItem value="365j">{t("periode365j")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => setType(v as TypeFiltre)}>
              <SelectTrigger className="w-[150px]"><FileText className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">{t("tousTypes")}</SelectItem>
                <SelectItem value="facture">{t("factures")}</SelectItem>
                <SelectItem value="paiement">{t("paiements")}</SelectItem>
                <SelectItem value="export">{t("exports")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statut} onValueChange={(v) => setStatut(v as StatutFiltre)}>
              <SelectTrigger className="w-[150px]"><Activity className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">{t("tousStatuts")}</SelectItem>
                <SelectItem value="termine">{t("termineSucces")}</SelectItem>
                <SelectItem value="en_cours">{t("filtreEnCours")}</SelectItem>
                <SelectItem value="en_attente">{t("filtreEnAttente")}</SelectItem>
                <SelectItem value="erreur">{t("filtreErreur")}</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setStatut("tous"); setType("tous"); }}>
                <X className="h-4 w-4 mr-1" />{t("reinitialiser")}
              </Button>
            )}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 ml-auto"><Badge variant="secondary">{t("resultats", { count: stats.totalSyncs })}</Badge></div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t("totalSyncs")}</p>
            <p className="text-3xl font-bold">{stats.totalSyncs}</p>
            <div className="flex items-center gap-1 mt-1">
              {stats.evolution >= 0 ? <ArrowUpRight className="h-4 w-4 text-green-500" /> : <ArrowDownRight className="h-4 w-4 text-red-500" />}
              <span className={`text-sm ${stats.evolution >= 0 ? "text-green-500" : "text-red-500"}`}>{Math.abs(stats.evolution).toFixed(1)}%</span>
              <span className="text-sm text-muted-foreground">{t("vsPeriode")}</span>
            </div>
          </div>
          <div className="p-3 rounded-full bg-blue-100"><Activity className="h-6 w-6 text-blue-600" /></div>
        </div></CardContent></Card>

        <Card><CardContent className="pt-4"><div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t("tauxReussite")}</p>
            <p className="text-3xl font-bold">{stats.tauxReussite.toFixed(1)}%</p>
            <Progress value={stats.tauxReussite} className="mt-2 h-2" />
          </div>
          <div className="p-3 rounded-full bg-green-100"><CheckCircle2 className="h-6 w-6 text-green-600" /></div>
        </div></CardContent></Card>

        <Card><CardContent className="pt-4"><div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t("ecrituresSync")}</p>
            <p className="text-3xl font-bold">{stats.totalEcritures}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("facturesEtPaiements")}</p>
          </div>
          <div className="p-3 rounded-full bg-purple-100"><Database className="h-6 w-6 text-purple-600" /></div>
        </div></CardContent></Card>

        <Card><CardContent className="pt-4"><div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t("enAttente")}</p>
            <p className="text-3xl font-bold">{enAttenteTotal}</p>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <FileText className="h-3 w-3" /><span>{t("nbFactures", { n: pendingItems?.facturesEnAttente || 0 })}</span>
              <CreditCard className="h-3 w-3 ml-2" /><span>{t("nbPaiements", { n: pendingItems?.paiementsEnAttente || 0 })}</span>
            </div>
          </div>
          <div className="p-3 rounded-full bg-orange-100"><Clock className="h-6 w-6 text-orange-600" /></div>
        </div></CardContent></Card>
      </div>

      {/* Graphique d'évolution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />{t("evolutionTitre")}{hasActiveFilters && <Badge variant="outline" className="ml-2">{t("filtre")}</Badge>}</CardTitle>
          <CardDescription>{t("evolutionDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-[200px] flex items-end gap-1">
              {chartData.slice(-30).map((d, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-primary rounded-t transition-all hover:bg-primary/80" style={{ height: `${(d.syncs / maxSyncs) * 150}px`, minHeight: d.syncs > 0 ? "4px" : "0" }} title={`${d.label}: ${d.syncs}`} />
                  {index % Math.ceil(chartData.slice(-30).length / 7) === 0 && (
                    <span className="text-xs text-muted-foreground rotate-45 origin-left whitespace-nowrap">{d.label}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">{t("aucuneDonnee")}</div>
          )}
        </CardContent>
      </Card>

      {/* Statut + répartition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>{t("statutTitre")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${syncStatus?.actif ? "bg-green-100" : "bg-gray-100"}`}>
                  {syncStatus?.actif ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Clock className="h-5 w-5 text-gray-600" />}
                </div>
                <div>
                  <p className="font-medium">{t("syncAuto")}</p>
                  <p className="text-sm text-muted-foreground">{syncStatus?.actif ? t("active") : t("inactive")}</p>
                </div>
              </div>
              <Badge variant={syncStatus?.actif ? "default" : "secondary"}>{syncStatus?.actif ? t("activee") : t("desactivee")}</Badge>
            </div>
            {syncStatus?.derniereSync && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("derniereSync")}</span>
                <span className="text-sm font-medium">{new Date(syncStatus.derniereSync).toLocaleString("fr-FR")}</span>
              </div>
            )}
            {syncStatus?.prochainSync && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("prochainSync")}</span>
                <span className="text-sm font-medium">{new Date(syncStatus.prochainSync).toLocaleString("fr-FR")}</span>
              </div>
            )}
            {(pendingItems?.erreurs || 0) > 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <span className="text-sm text-red-700">{t("erreursAttention", { n: pendingItems?.erreurs })}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("repartitionType")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" /><span className="text-sm">{t("factures")}</span></div>
                  <span className="text-sm font-medium">{t("nEnAttente", { n: pendingItems?.facturesEnAttente || 0 })}</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-green-500" /><span className="text-sm">{t("paiements")}</span></div>
                  <span className="text-sm font-medium">{t("nEnAttente", { n: pendingItems?.paiementsEnAttente || 0 })}</span>
                </div>
                <Progress value={60} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-500" /><span className="text-sm">{t("erreurs")}</span></div>
                  <span className="text-sm font-medium">{pendingItems?.erreurs || 0}</span>
                </div>
                <Progress value={pendingItems?.erreurs ? 100 : 0} className="h-2 bg-red-100" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historique récent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />{t("historiqueTitre")}{hasActiveFilters && <Badge variant="outline" className="ml-2">{t("filtre")}</Badge>}</CardTitle>
          <CardDescription>{t("historiqueDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colDate")}</TableHead>
                <TableHead>{t("colType")}</TableHead>
                <TableHead>{t("colLogiciel")}</TableHead>
                <TableHead>{t("colDetails")}</TableHead>
                <TableHead>{t("colStatut")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.logsRecents.length > 0 ? (
                stats.logsRecents.map((log, index) => (
                  <TableRow key={`${log.sourceType}-${log.id}-${index}`}>
                    <TableCell>{log.createdAt ? new Date(log.createdAt).toLocaleString("fr-FR") : "-"}</TableCell>
                    <TableCell><TypeBadge sourceType={log.sourceType} /></TableCell>
                    <TableCell>{log.logiciel?.toUpperCase() || "-"}</TableCell>
                    <TableCell>{log.nombreEcritures ? t("nbEcritures", { n: log.nombreEcritures }) : "-"}</TableCell>
                    <TableCell><StatutBadge statut={log.statut || "termine"} /></TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">{hasActiveFilters ? t("aucunResultatFiltre") : t("aucuneSyncRecente")}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Indicateurs de performance */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />{t("perfTitre")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-green-600">{stats.syncsReussies}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("syncsReussies")}</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-red-600">{stats.syncsErreur}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("syncsErreur")}</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-blue-600">{stats.totalSyncs > 0 ? Math.round(stats.totalEcritures / stats.totalSyncs) : 0}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("ecrituresMoyennes")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
