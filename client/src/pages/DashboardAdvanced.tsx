import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, TrendingDown, Users, FileText, Euro, BarChart3, PieChart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from "recharts";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DashboardAdvanced() {
  const { user, loading: authLoading } = useAuth();
  
  const { data: monthlyCA, isLoading: loadingCA } = trpc.dashboard.getMonthlyCA.useQuery({ months: 12 });
  const { data: yearlyComparison, isLoading: loadingYearly } = trpc.dashboard.getYearlyComparison.useQuery();
  const { data: conversionRate, isLoading: loadingConversion } = trpc.dashboard.getConversionRate.useQuery();
  const { data: topClients, isLoading: loadingTopClients } = trpc.dashboard.getTopClients.useQuery({ limit: 5 });
  const { data: clientEvolution, isLoading: loadingClientEvolution } = trpc.dashboard.getClientEvolution.useQuery({ months: 12 });
  const { data: stats, isLoading: loadingStats } = trpc.dashboard.getStats.useQuery();

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Veuillez vous connecter pour accéder au tableau de bord avancé.</p>
        </div>
      </DashboardLayout>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const isLoading = loadingCA || loadingYearly || loadingConversion || loadingTopClients || loadingClientEvolution || loadingStats;

  // Prepare pie chart data for conversion rate
  const conversionPieData = conversionRate ? [
    { name: 'Acceptés', value: conversionRate.devisAcceptes },
    { name: 'Refusés/Expirés', value: conversionRate.totalDevis - conversionRate.devisAcceptes }
  ] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tableau de Bord Avancé</h1>
            <p className="text-muted-foreground">Analyse détaillée de votre activité</p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline">Tableau de bord simple</Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">CA Année en cours</CardTitle>
                  <Euro className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(yearlyComparison?.currentYear || 0)}</div>
                  <div className="flex items-center text-xs">
                    {(yearlyComparison?.growth || 0) >= 0 ? (
                      <>
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                        <span className="text-green-500">+{yearlyComparison?.growth.toFixed(1)}%</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                        <span className="text-red-500">{yearlyComparison?.growth.toFixed(1)}%</span>
                      </>
                    )}
                    <span className="text-muted-foreground ml-1">vs année précédente</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">CA Année précédente</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(yearlyComparison?.previousYear || 0)}</div>
                  <p className="text-xs text-muted-foreground">Total année N-1</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Taux de conversion</CardTitle>
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{conversionRate?.rate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">
                    {conversionRate?.devisAcceptes} / {conversionRate?.totalDevis} devis acceptés
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
                  <p className="text-xs text-muted-foreground">Clients actifs</p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="ca" className="space-y-4">
              <TabsList>
                <TabsTrigger value="ca">Évolution CA</TabsTrigger>
                <TabsTrigger value="comparison">Comparatif Annuel</TabsTrigger>
                <TabsTrigger value="clients">Clients</TabsTrigger>
                <TabsTrigger value="conversion">Conversion</TabsTrigger>
              </TabsList>

              <TabsContent value="ca" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Évolution du Chiffre d'Affaires</CardTitle>
                    <CardDescription>CA mensuel sur les 12 derniers mois</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyCA || []}>
                          <defs>
                            <linearGradient id="colorCA" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k€`} />
                          <Tooltip 
                            formatter={(value: number) => [formatCurrency(value), 'CA']}
                            labelFormatter={(label) => `Mois: ${label}`}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="ca" 
                            stroke="#3b82f6" 
                            fillOpacity={1} 
                            fill="url(#colorCA)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="comparison" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Comparatif Année N vs N-1</CardTitle>
                      <CardDescription>Évolution du chiffre d'affaires</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                            { name: 'Année N-1', value: yearlyComparison?.previousYear || 0 },
                            { name: 'Année N', value: yearlyComparison?.currentYear || 0 }
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k€`} />
                            <Tooltip formatter={(value: number) => [formatCurrency(value), 'CA']} />
                            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                              <Cell fill="#94a3b8" />
                              <Cell fill="#3b82f6" />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Croissance</CardTitle>
                      <CardDescription>Évolution par rapport à l'année précédente</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col items-center justify-center h-[300px]">
                        <div className={`text-6xl font-bold ${(yearlyComparison?.growth || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {(yearlyComparison?.growth || 0) >= 0 ? '+' : ''}{yearlyComparison?.growth.toFixed(1)}%
                        </div>
                        <div className="flex items-center mt-4">
                          {(yearlyComparison?.growth || 0) >= 0 ? (
                            <TrendingUp className="h-8 w-8 text-green-500" />
                          ) : (
                            <TrendingDown className="h-8 w-8 text-red-500" />
                          )}
                        </div>
                        <p className="text-muted-foreground mt-2">
                          {formatCurrency(Math.abs((yearlyComparison?.currentYear || 0) - (yearlyComparison?.previousYear || 0)))}
                          {(yearlyComparison?.growth || 0) >= 0 ? ' de plus' : ' de moins'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="clients" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top 5 Clients</CardTitle>
                      <CardDescription>Clients avec le plus de CA</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={topClients?.map(tc => ({
                              name: tc.client.nom.length > 15 ? tc.client.nom.substring(0, 15) + '...' : tc.client.nom,
                              ca: tc.totalCA
                            })) || []}
                            layout="vertical"
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k€`} />
                            <YAxis type="category" dataKey="name" width={100} />
                            <Tooltip formatter={(value: number) => [formatCurrency(value), 'CA']} />
                            <Bar dataKey="ca" fill="#10b981" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Évolution du Portefeuille Clients</CardTitle>
                      <CardDescription>Nombre de clients sur 12 mois</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={clientEvolution || []}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip />
                            <Line 
                              type="monotone" 
                              dataKey="count" 
                              stroke="#10b981" 
                              strokeWidth={2}
                              dot={{ fill: '#10b981' }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Détail Top Clients</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {topClients?.map((tc, index) => (
                        <div key={tc.client.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium">{tc.client.nom}</p>
                              <p className="text-sm text-muted-foreground">{tc.client.email}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">{formatCurrency(tc.totalCA)}</p>
                            <Link href={`/clients/${tc.client.id}`}>
                              <Button variant="link" size="sm" className="p-0">Voir fiche</Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="conversion" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Taux de Conversion des Devis</CardTitle>
                      <CardDescription>Répartition des devis par statut final</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={conversionPieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {conversionPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Statistiques de Conversion</CardTitle>
                      <CardDescription>Détail des performances</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="h-8 w-8 text-blue-500" />
                            <div>
                              <p className="text-sm text-muted-foreground">Total devis traités</p>
                              <p className="text-2xl font-bold">{conversionRate?.totalDevis || 0}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
                          <div className="flex items-center gap-3">
                            <TrendingUp className="h-8 w-8 text-green-500" />
                            <div>
                              <p className="text-sm text-muted-foreground">Devis acceptés</p>
                              <p className="text-2xl font-bold text-green-600">{conversionRate?.devisAcceptes || 0}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-4 border rounded-lg bg-red-50">
                          <div className="flex items-center gap-3">
                            <TrendingDown className="h-8 w-8 text-red-500" />
                            <div>
                              <p className="text-sm text-muted-foreground">Devis refusés/expirés</p>
                              <p className="text-2xl font-bold text-red-600">
                                {(conversionRate?.totalDevis || 0) - (conversionRate?.devisAcceptes || 0)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="text-center p-4 border rounded-lg bg-primary/5">
                          <p className="text-sm text-muted-foreground">Taux de réussite</p>
                          <p className="text-4xl font-bold text-primary">{conversionRate?.rate.toFixed(1)}%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
