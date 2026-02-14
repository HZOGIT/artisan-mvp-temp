import { trpc } from "@/lib/trpc";
import CalendarWidget from "@/components/CalendarWidget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import {
  Euro,
  FileText,
  Receipt,
  Calendar,
  Users,
  TrendingUp,
  Plus,
  ArrowRight,
  Clock,
  PercentIcon,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.getStats.useQuery();
  const { data: upcomingInterventions } = trpc.dashboard.getUpcomingInterventions.useQuery();
  const { data: conversionRate } = trpc.dashboard.getConversionRate.useQuery();

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

  // Limit to 3 upcoming interventions
  const nextInterventions = (upcomingInterventions || []).slice(0, 3);

  // Conversion rate
  const rate = typeof conversionRate === 'number' ? conversionRate : (conversionRate as any)?.rate || 0;
  const totalDevis = (conversionRate as any)?.totalDevis || 0;
  const devisAcceptes = (conversionRate as any)?.devisAcceptes || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground mt-1">
            Vue d'ensemble de votre activité
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setLocation("/devis/nouveau")} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Devis
          </Button>
          <Button onClick={() => setLocation("/factures")} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Facture
          </Button>
          <Button onClick={() => setLocation("/clients/nouveau")} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Client
          </Button>
        </div>
      </div>

      {/* Stats Cards - 2 cols mobile, 5 cols desktop */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {/* CA du mois */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              CA du mois
            </CardTitle>
            <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center">
              <Euro className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.caMonth || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(stats?.caYear || 0)} cette année
            </p>
          </CardContent>
        </Card>

        {/* Devis en attente */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Devis en attente
            </CardTitle>
            <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.devisEnCours || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              En attente de réponse
            </p>
          </CardContent>
        </Card>

        {/* Factures impayées */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Factures impayées
            </CardTitle>
            <div className="h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.facturesImpayees?.count || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(stats?.facturesImpayees?.total || 0)} à encaisser
            </p>
          </CardContent>
        </Card>

        {/* Taux de conversion */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taux conversion
            </CardTitle>
            <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(rate)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {devisAcceptes}/{totalDevis} devis acceptés
            </p>
          </CardContent>
        </Card>

        {/* Clients */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clients
            </CardTitle>
            <div className="h-9 w-9 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Dans votre base
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - 2 cols */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Prochaines interventions (3 max) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Prochaines interventions</CardTitle>
                <CardDescription>
                  {stats?.interventionsAVenir || 0} planifiée(s)
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/interventions")}>
                Voir tout
                <ArrowRight className="h-4 w-4 ml-1" />
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
                    onClick={() => setLocation(`/interventions`)}
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">
                        {intervention.titre}
                      </p>
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
                <Button
                  variant="link"
                  size="sm"
                  className="mt-2"
                  onClick={() => setLocation("/interventions")}
                >
                  Planifier une intervention
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Calendrier Compact */}
        <CalendarWidget />

        {/* Actions rapides */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Actions rapides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => setLocation("/clients/nouveau")}
              >
                <Users className="h-4 w-4 mr-2 text-purple-600" />
                Nouveau client
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => setLocation("/devis/nouveau")}
              >
                <FileText className="h-4 w-4 mr-2 text-blue-600" />
                Nouveau devis
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => setLocation("/factures")}
              >
                <Receipt className="h-4 w-4 mr-2 text-green-600" />
                Nouvelle facture
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => setLocation("/interventions")}
              >
                <Calendar className="h-4 w-4 mr-2 text-orange-600" />
                Intervention
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
