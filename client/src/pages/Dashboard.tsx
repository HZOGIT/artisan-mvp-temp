import { trpc } from "@/lib/trpc";
import CalendarWidget from "@/components/CalendarWidget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import {
  Euro, FileText, Receipt, Calendar, Users, TrendingUp, Plus, ArrowRight,
  Clock, AlertTriangle, MessageCircle, AlertCircle, Info, Target,
  UserPlus, ShieldAlert, Activity,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const DEVIS_STATUS_COLORS: Record<string, string> = {
  brouillon: '#94a3b8',
  envoye: '#3b82f6',
  accepte: '#10b981',
  refuse: '#ef4444',
  expire: '#f59e0b',
};
const DEVIS_STATUS_LABELS: Record<string, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
  expire: 'Expiré',
};

function formatRelativeDate(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "A l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Hier";
  if (diffD < 7) return `Il y a ${diffD} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const activityIcons: Record<string, any> = {
  devis: FileText,
  facture: Receipt,
  intervention: Calendar,
  client: UserPlus,
};
const activityColors: Record<string, string> = {
  devis: 'text-blue-500',
  facture: 'text-green-500',
  intervention: 'text-orange-500',
  client: 'text-purple-500',
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.getStats.useQuery();
  const { data: upcomingInterventions } = trpc.dashboard.getUpcomingInterventions.useQuery();
  const { data: conversionRate } = trpc.dashboard.getConversionRate.useQuery();
  const { data: unreadMessages } = trpc.chat.getUnreadCount.useQuery();
  const { data: monthlyCA } = trpc.dashboard.getMonthlyCA.useQuery({ months: 6 });
  const { data: topClients } = trpc.dashboard.getTopClients.useQuery({ limit: 5 });
  const { data: recentActivity } = trpc.dashboard.getRecentActivity.useQuery({ limit: 8 });
  const { data: objectifs } = trpc.dashboard.getObjectifs.useQuery();
  const { data: alerts } = trpc.dashboard.getAlerts.useQuery();
  const { data: devisStats } = trpc.statistiques.getDevisStats.useQuery();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const nextInterventions = (upcomingInterventions || []).slice(0, 3);
  const rate = typeof conversionRate === 'number' ? conversionRate : (conversionRate as any)?.rate || 0;
  const totalDevis = (conversionRate as any)?.totalDevis || 0;
  const devisAcceptes = (conversionRate as any)?.devisAcceptes || 0;

  // Prepare pie chart data
  const devisPieData = devisStats?.parStatut
    ? Object.entries(devisStats.parStatut).map(([key, value]) => ({
        name: DEVIS_STATUS_LABELS[key] || key,
        value: value as number,
        color: DEVIS_STATUS_COLORS[key] || '#94a3b8',
      })).filter(d => d.value > 0)
    : [];

  // Objectifs progress
  const objCA = objectifs ? Math.min(100, objectifs.objectifCA > 0 ? (objectifs.currentCA / objectifs.objectifCA) * 100 : 0) : 0;
  const objDevis = objectifs ? Math.min(100, objectifs.objectifDevis > 0 ? (objectifs.currentDevis / objectifs.objectifDevis) * 100 : 0) : 0;
  const objClients = objectifs ? Math.min(100, objectifs.objectifClients > 0 ? (objectifs.currentClients / objectifs.objectifClients) * 100 : 0) : 0;

  const alertIcon = { danger: AlertCircle, warning: AlertTriangle, info: Info };
  const alertBg = { danger: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800', warning: 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800', info: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' };
  const alertText = { danger: 'text-red-700 dark:text-red-400', warning: 'text-orange-700 dark:text-orange-400', info: 'text-blue-700 dark:text-blue-400' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground mt-1">Vue d'ensemble de votre activité</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setLocation("/devis/nouveau")} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Devis
          </Button>
          <Button onClick={() => setLocation("/factures")} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Facture
          </Button>
          <Button onClick={() => setLocation("/clients/nouveau")} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Client
          </Button>
        </div>
      </div>

      {/* Alertes intelligentes */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert: any, i: number) => {
            const Icon = alertIcon[alert.type as keyof typeof alertIcon] || Info;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg border ${alertBg[alert.type as keyof typeof alertBg] || ''}`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${alertText[alert.type as keyof typeof alertText] || ''}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${alertText[alert.type as keyof typeof alertText] || ''}`}>
                    {alert.titre}
                  </p>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                </div>
                {alert.lien && (
                  <Button variant="ghost" size="sm" onClick={() => setLocation(alert.lien)}>
                    Voir <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CA du mois</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Euro className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.caMonth || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(stats?.caYear || 0)} cette année</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Devis en attente</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.devisEnCours || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">En attente de réponse</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Factures impayées</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.facturesImpayees?.count || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(stats?.facturesImpayees?.total || 0)} à encaisser</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taux conversion</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(rate)}%</div>
            <p className="text-xs text-muted-foreground mt-1">{devisAcceptes}/{totalDevis} devis acceptés</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Users className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Dans votre base</p>
          </CardContent>
        </Card>
        <Card className={unreadMessages && unreadMessages > 0 ? "border-rose-200 bg-rose-50/30 dark:border-rose-800 dark:bg-rose-950/20" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Messages</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unreadMessages || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <button onClick={() => setLocation("/chat")} className="text-primary hover:underline">
                {unreadMessages && unreadMessages > 0 ? "Non lu(s) — Voir" : "Aucun non lu"}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Objectifs mensuels */}
      {objectifs && (objectifs.objectifCA > 0 || objectifs.objectifDevis > 0 || objectifs.objectifClients > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-5 w-5 text-primary" />
              Objectifs du mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              {objectifs.objectifCA > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Chiffre d'affaires</span>
                    <span className="font-medium">{formatCurrency(objectifs.currentCA)} / {formatCurrency(objectifs.objectifCA)}</span>
                  </div>
                  <Progress value={objCA} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">{Math.round(objCA)}%</p>
                </div>
              )}
              {objectifs.objectifDevis > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Devis créés</span>
                    <span className="font-medium">{objectifs.currentDevis} / {objectifs.objectifDevis}</span>
                  </div>
                  <Progress value={objDevis} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">{Math.round(objDevis)}%</p>
                </div>
              )}
              {objectifs.objectifClients > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Nouveaux clients</span>
                    <span className="font-medium">{objectifs.currentClients} / {objectifs.objectifClients}</span>
                  </div>
                  <Progress value={objClients} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">{Math.round(objClients)}%</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts row: CA mensuel + Devis PieChart */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* CA Mensuel AreaChart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CA Mensuel</CardTitle>
            <CardDescription>Evolution sur les 6 derniers mois</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyCA && monthlyCA.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={monthlyCA}>
                  <defs>
                    <linearGradient id="colorCA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), 'CA']} />
                  <Area type="monotone" dataKey="ca" stroke="#3b82f6" strokeWidth={2} fill="url(#colorCA)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Aucune donnée disponible
              </div>
            )}
          </CardContent>
        </Card>

        {/* Devis par statut PieChart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition des devis</CardTitle>
            <CardDescription>{devisStats?.total || 0} devis au total</CardDescription>
          </CardHeader>
          <CardContent>
            {devisPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPieChart>
                  <Pie
                    data={devisPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {devisPieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Aucun devis
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top clients + Activité récente */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top 5 clients BarChart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Top 5 clients</CardTitle>
                <CardDescription>Par chiffre d'affaires</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/clients")}>
                Voir tout <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {topClients && topClients.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={topClients.map((c: any) => ({
                    nom: c.client ? `${c.client.prenom || ''} ${c.client.nom}`.trim() : c.nom || 'Inconnu',
                    ca: c.totalCA || c.ca || 0,
                  }))}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                  <YAxis type="category" dataKey="nom" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), 'CA']} />
                  <Bar dataKey="ca" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                Aucune donnée
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activité récente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-primary" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((a: any, i: number) => {
                  const Icon = activityIcons[a.type] || FileText;
                  const color = activityColors[a.type] || 'text-muted-foreground';
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-muted ${color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{a.titre}</p>
                        <p className="text-xs text-muted-foreground">{formatRelativeDate(a.date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Aucune activité récente
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Interventions + Calendar */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Prochaines interventions</CardTitle>
                <CardDescription>{stats?.interventionsAVenir || 0} planifiée(s)</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/interventions")}>
                Voir tout <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {nextInterventions.length > 0 ? (
              <div className="space-y-3">
                {nextInterventions.map((intervention: any) => (
                  <div
                    key={intervention.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setLocation("/interventions")}
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{intervention.titre}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {intervention.client?.nom} {intervention.client?.prenom}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(intervention.dateDebut), "EEE d MMM à HH:mm", { locale: fr })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Aucune intervention planifiée</p>
                <Button variant="link" size="sm" className="mt-2" onClick={() => setLocation("/interventions")}>
                  Planifier une intervention
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <CalendarWidget />
      </div>

      {/* Actions rapides */}
      <Card>
        <CardHeader>
          <CardTitle>Actions rapides</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="justify-start h-auto py-3" onClick={() => setLocation("/clients/nouveau")}>
              <Users className="h-4 w-4 mr-2 text-purple-600" /> Nouveau client
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" onClick={() => setLocation("/devis/nouveau")}>
              <FileText className="h-4 w-4 mr-2 text-blue-600" /> Nouveau devis
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" onClick={() => setLocation("/factures")}>
              <Receipt className="h-4 w-4 mr-2 text-green-600" /> Nouvelle facture
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" onClick={() => setLocation("/interventions")}>
              <Calendar className="h-4 w-4 mr-2 text-orange-600" /> Intervention
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
