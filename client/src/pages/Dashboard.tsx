import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.getStats.useQuery();
  const { data: upcomingInterventions, isLoading: interventionsLoading } = trpc.dashboard.getUpcomingInterventions.useQuery();

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tableau de bord</h1>
          <p className="text-muted-foreground mt-1">
            Vue d'ensemble de votre activité
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setLocation("/devis")} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Nouveau devis
          </Button>
          <Button onClick={() => setLocation("/clients")}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau client
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              CA du mois
            </CardTitle>
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Euro className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.caMonth || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(stats?.caYear || 0)} cette année
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Devis en cours
            </CardTitle>
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.devisEnCours || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              En attente de réponse
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Factures impayées
            </CardTitle>
            <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.facturesImpayees?.count || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(stats?.facturesImpayees?.total || 0)} en attente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clients
            </CardTitle>
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-600" />
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

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Interventions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Interventions à venir</CardTitle>
                <CardDescription>
                  {stats?.interventionsAVenir || 0} intervention(s) planifiée(s)
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/interventions")}>
                Voir tout
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {interventionsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : upcomingInterventions && upcomingInterventions.length > 0 ? (
              <div className="space-y-4">
                {upcomingInterventions.map((intervention: any) => (
                  <div 
                    key={intervention.id} 
                    className="flex items-start gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/interventions`)}
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {intervention.titre}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {intervention.client?.nom} {intervention.client?.prenom}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(intervention.dateDebut), "EEEE d MMMM à HH:mm", { locale: fr })}
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

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions rapides</CardTitle>
            <CardDescription>
              Accédez rapidement aux fonctionnalités principales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <Button 
                variant="outline" 
                className="justify-start h-auto py-4"
                onClick={() => setLocation("/clients")}
              >
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center mr-4">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Ajouter un client</p>
                  <p className="text-sm text-muted-foreground">Créer une nouvelle fiche client</p>
                </div>
              </Button>

              <Button 
                variant="outline" 
                className="justify-start h-auto py-4"
                onClick={() => setLocation("/devis")}
              >
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center mr-4">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Créer un devis</p>
                  <p className="text-sm text-muted-foreground">Établir un nouveau devis</p>
                </div>
              </Button>

              <Button 
                variant="outline" 
                className="justify-start h-auto py-4"
                onClick={() => setLocation("/factures")}
              >
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center mr-4">
                  <Receipt className="h-5 w-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Créer une facture</p>
                  <p className="text-sm text-muted-foreground">Facturer un client</p>
                </div>
              </Button>

              <Button 
                variant="outline" 
                className="justify-start h-auto py-4"
                onClick={() => setLocation("/interventions")}
              >
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center mr-4">
                  <Calendar className="h-5 w-5 text-orange-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Planifier une intervention</p>
                  <p className="text-sm text-muted-foreground">Organiser votre planning</p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
