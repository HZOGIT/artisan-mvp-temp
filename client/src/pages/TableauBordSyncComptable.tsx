import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  TrendingUp,
  TrendingDown,
  FileText,
  CreditCard,
  Activity,
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Database
} from "lucide-react";

export default function TableauBordSyncComptable() {
  const [periodeFiltree, setPeriodeFiltree] = useState<"7j" | "30j" | "90j" | "365j">("30j");

  const { data: syncStatus } = trpc.integrationsComptables.getSyncStatus.useQuery();
  const { data: syncLogs } = trpc.integrationsComptables.getSyncLogs.useQuery();
  const { data: pendingItems } = trpc.integrationsComptables.getPendingItems.useQuery();
  const { data: exports } = trpc.integrationsComptables.getExports.useQuery();

  const utils = trpc.useUtils();

  const lancerSyncMutation = trpc.integrationsComptables.lancerSync.useMutation({
    onSuccess: (data) => {
      toast.success(`Synchronisation terminée: ${data.facturesSyncees} factures, ${data.paiementsSynces} paiements`);
      utils.integrationsComptables.getSyncLogs.invalidate();
      utils.integrationsComptables.getSyncStatus.invalidate();
      utils.integrationsComptables.getPendingItems.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Calculer les statistiques
  const stats = useMemo(() => {
    if (!syncLogs || !exports) return null;

    const now = new Date();
    const periodeJours = parseInt(periodeFiltree);
    const dateDebut = new Date(now.getTime() - periodeJours * 24 * 60 * 60 * 1000);

    // Filtrer les logs par période
    const logsFilters = syncLogs.filter((log: any) => {
      const logDate = new Date(log.createdAt);
      return logDate >= dateDebut;
    });

    const exportsFilters = exports.filter((exp: any) => {
      const expDate = new Date(exp.createdAt);
      return expDate >= dateDebut;
    });

    // Calculer les totaux
    const totalSyncs = logsFilters.length + exportsFilters.length;
    const syncsReussies = logsFilters.filter((l: any) => l.statut === 'termine' || l.statut === 'succes').length +
                         exportsFilters.filter((e: any) => e.statut === 'termine').length;
    const syncsErreur = logsFilters.filter((l: any) => l.statut === 'erreur').length +
                        exportsFilters.filter((e: any) => e.statut === 'erreur').length;
    
    const tauxReussite = totalSyncs > 0 ? (syncsReussies / totalSyncs) * 100 : 100;

    // Calculer les écritures totales
    const totalEcritures = exportsFilters.reduce((sum: number, e: any) => sum + (e.nombreEcritures || 0), 0);

    // Évolution par rapport à la période précédente
    const datePrecedente = new Date(dateDebut.getTime() - periodeJours * 24 * 60 * 60 * 1000);
    const logsPrecedents = syncLogs.filter((log: any) => {
      const logDate = new Date(log.createdAt);
      return logDate >= datePrecedente && logDate < dateDebut;
    });
    const exportsPrecedents = exports.filter((exp: any) => {
      const expDate = new Date(exp.createdAt);
      return expDate >= datePrecedente && expDate < dateDebut;
    });
    const totalPrecedent = logsPrecedents.length + exportsPrecedents.length;
    const evolution = totalPrecedent > 0 ? ((totalSyncs - totalPrecedent) / totalPrecedent) * 100 : 0;

    return {
      totalSyncs,
      syncsReussies,
      syncsErreur,
      tauxReussite,
      totalEcritures,
      evolution,
      logsRecents: [...logsFilters, ...exportsFilters]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10),
    };
  }, [syncLogs, exports, periodeFiltree]);

  // Données pour le graphique (simulé)
  const chartData = useMemo(() => {
    if (!syncLogs || !exports) return [];

    const now = new Date();
    const periodeJours = parseInt(periodeFiltree);
    const data = [];

    for (let i = periodeJours - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      const syncsJour = (syncLogs as any[]).filter((l: any) => {
        const logDate = new Date(l.createdAt).toISOString().split('T')[0];
        return logDate === dateStr;
      }).length;
      
      const exportsJour = (exports as any[]).filter((e: any) => {
        const expDate = new Date(e.createdAt).toISOString().split('T')[0];
        return expDate === dateStr;
      }).length;

      data.push({
        date: dateStr,
        syncs: syncsJour + exportsJour,
        label: date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      });
    }

    return data;
  }, [syncLogs, exports, periodeFiltree]);

  const getStatutBadge = (statut: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive"; icon: React.ReactNode; label: string }> = {
      en_cours: { variant: "secondary", icon: <RefreshCw className="h-3 w-3 animate-spin" />, label: "En cours" },
      termine: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, label: "Terminé" },
      succes: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, label: "Succès" },
      erreur: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" />, label: "Erreur" },
      en_attente: { variant: "secondary", icon: <Clock className="h-3 w-3" />, label: "En attente" },
    };
    const { variant, icon, label } = config[statut] || config.en_attente;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {label}
      </Badge>
    );
  };

  const maxSyncs = Math.max(...chartData.map(d => d.syncs), 1);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tableau de Bord Synchronisations</h1>
          <p className="text-muted-foreground">
            Suivi et statistiques des synchronisations comptables
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={periodeFiltree} onValueChange={(v: "7j" | "30j" | "90j" | "365j") => setPeriodeFiltree(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7j">7 derniers jours</SelectItem>
              <SelectItem value="30j">30 derniers jours</SelectItem>
              <SelectItem value="90j">90 derniers jours</SelectItem>
              <SelectItem value="365j">12 derniers mois</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => lancerSyncMutation.mutate()}
            disabled={lancerSyncMutation.isPending}
          >
            {lancerSyncMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Synchronisation...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Synchroniser
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Synchronisations</p>
                <p className="text-3xl font-bold">{stats?.totalSyncs || 0}</p>
                <div className="flex items-center gap-1 mt-1">
                  {(stats?.evolution || 0) >= 0 ? (
                    <ArrowUpRight className="h-4 w-4 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-sm ${(stats?.evolution || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {Math.abs(stats?.evolution || 0).toFixed(1)}%
                  </span>
                  <span className="text-sm text-muted-foreground">vs période précédente</span>
                </div>
              </div>
              <div className="p-3 rounded-full bg-blue-100">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taux de Réussite</p>
                <p className="text-3xl font-bold">{(stats?.tauxReussite || 100).toFixed(1)}%</p>
                <Progress value={stats?.tauxReussite || 100} className="mt-2 h-2" />
              </div>
              <div className="p-3 rounded-full bg-green-100">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Écritures Synchronisées</p>
                <p className="text-3xl font-bold">{stats?.totalEcritures || 0}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Factures et paiements
                </p>
              </div>
              <div className="p-3 rounded-full bg-purple-100">
                <Database className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En Attente</p>
                <p className="text-3xl font-bold">
                  {(pendingItems?.facturesEnAttente || 0) + (pendingItems?.paiementsEnAttente || 0)}
                </p>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <span>{pendingItems?.facturesEnAttente || 0} factures</span>
                  <CreditCard className="h-3 w-3 ml-2" />
                  <span>{pendingItems?.paiementsEnAttente || 0} paiements</span>
                </div>
              </div>
              <div className="p-3 rounded-full bg-orange-100">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graphique d'évolution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Évolution des Synchronisations
          </CardTitle>
          <CardDescription>
            Nombre de synchronisations par jour sur la période sélectionnée
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-[200px] flex items-end gap-1">
              {chartData.slice(-30).map((data, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
                    style={{ height: `${(data.syncs / maxSyncs) * 150}px`, minHeight: data.syncs > 0 ? '4px' : '0' }}
                    title={`${data.label}: ${data.syncs} synchronisation(s)`}
                  />
                  {index % Math.ceil(chartData.slice(-30).length / 7) === 0 && (
                    <span className="text-xs text-muted-foreground rotate-45 origin-left whitespace-nowrap">
                      {data.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              Aucune donnée disponible
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statut de synchronisation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Statut actuel */}
        <Card>
          <CardHeader>
            <CardTitle>Statut de Synchronisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${syncStatus?.actif ? "bg-green-100" : "bg-gray-100"}`}>
                  {syncStatus?.actif ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Clock className="h-5 w-5 text-gray-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium">Synchronisation automatique</p>
                  <p className="text-sm text-muted-foreground">
                    {syncStatus?.actif ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
              <Badge variant={syncStatus?.actif ? "default" : "secondary"}>
                {syncStatus?.actif ? "Activée" : "Désactivée"}
              </Badge>
            </div>

            {syncStatus?.derniereSync && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Dernière synchronisation</span>
                <span className="text-sm font-medium">
                  {new Date(syncStatus.derniereSync).toLocaleString("fr-FR")}
                </span>
              </div>
            )}

            {syncStatus?.prochainSync && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Prochaine synchronisation</span>
                <span className="text-sm font-medium">
                  {new Date(syncStatus.prochainSync).toLocaleString("fr-FR")}
                </span>
              </div>
            )}

            {(pendingItems?.erreurs || 0) > 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <span className="text-sm text-red-700">
                  {pendingItems?.erreurs} erreur(s) nécessitant une attention
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Répartition par type */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition par Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Factures</span>
                  </div>
                  <span className="text-sm font-medium">{pendingItems?.facturesEnAttente || 0} en attente</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Paiements</span>
                  </div>
                  <span className="text-sm font-medium">{pendingItems?.paiementsEnAttente || 0} en attente</span>
                </div>
                <Progress value={60} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm">Erreurs</span>
                  </div>
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
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Historique Récent
          </CardTitle>
          <CardDescription>
            Les 10 dernières opérations de synchronisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Logiciel</TableHead>
                <TableHead>Détails</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats?.logsRecents && stats.logsRecents.length > 0 ? (
                stats.logsRecents.map((log: any, index: number) => (
                  <TableRow key={`${log.type}-${log.id}-${index}`}>
                    <TableCell>
                      {log.createdAt ? new Date(log.createdAt).toLocaleString("fr-FR") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {log.type === "export" ? "Export" : "Sync"}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.logiciel?.toUpperCase() || "-"}</TableCell>
                    <TableCell>
                      {log.nombreEcritures ? `${log.nombreEcritures} écritures` : "-"}
                    </TableCell>
                    <TableCell>{getStatutBadge(log.statut || "termine")}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Aucune synchronisation récente
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Indicateurs de performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Indicateurs de Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-green-600">{stats?.syncsReussies || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Synchronisations réussies</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-red-600">{stats?.syncsErreur || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Synchronisations en erreur</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-blue-600">
                {stats?.totalSyncs && stats.totalSyncs > 0 
                  ? Math.round(stats.totalEcritures / stats.totalSyncs) 
                  : 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Écritures moyennes par sync</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
