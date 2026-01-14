import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format, subDays, subMonths, differenceInDays, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { TrendingUp, TrendingDown, FileText, CheckCircle, XCircle, Clock, Euro, BarChart3 } from "lucide-react";

export default function StatistiquesDevis() {
  const [periode, setPeriode] = useState<string>("30");
  
  const { data: devisList } = trpc.devis.list.useQuery();
  const { data: facturesList } = trpc.factures.list.useQuery();

  // Filtrer par période
  const dateLimit = periode === "all" ? null : subDays(new Date(), parseInt(periode));
  
  const filteredDevis = devisList?.filter((devis: any) => {
    if (!dateLimit) return true;
    const devisDate = devis.dateDevis ? new Date(devis.dateDevis) : null;
    return devisDate && devisDate >= dateLimit;
  }) || [];

  // Statistiques de base
  const totalDevis = filteredDevis.length;
  const devisAcceptes = filteredDevis.filter((d: any) => d.statut === "accepte").length;
  const devisRefuses = filteredDevis.filter((d: any) => d.statut === "refuse").length;
  const devisEnvoyes = filteredDevis.filter((d: any) => d.statut === "envoye").length;
  const devisBrouillons = filteredDevis.filter((d: any) => d.statut === "brouillon").length;
  const devisExpires = filteredDevis.filter((d: any) => d.statut === "expire").length;

  // Taux de conversion
  const devisTraites = devisAcceptes + devisRefuses;
  const tauxConversion = devisTraites > 0 ? ((devisAcceptes / devisTraites) * 100).toFixed(1) : "0";
  const tauxRefus = devisTraites > 0 ? ((devisRefuses / devisTraites) * 100).toFixed(1) : "0";

  // Montants
  const montantTotal = filteredDevis.reduce((sum: number, d: any) => sum + parseFloat(d.totalTTC || "0"), 0);
  const montantAccepte = filteredDevis
    .filter((d: any) => d.statut === "accepte")
    .reduce((sum: number, d: any) => sum + parseFloat(d.totalTTC || "0"), 0);
  const montantEnAttente = filteredDevis
    .filter((d: any) => d.statut === "envoye")
    .reduce((sum: number, d: any) => sum + parseFloat(d.totalTTC || "0"), 0);
  const montantPerdu = filteredDevis
    .filter((d: any) => d.statut === "refuse" || d.statut === "expire")
    .reduce((sum: number, d: any) => sum + parseFloat(d.totalTTC || "0"), 0);

  // Délai moyen de réponse (pour les devis acceptés ou refusés)
  const devisAvecReponse = filteredDevis.filter((d: any) => 
    (d.statut === "accepte" || d.statut === "refuse") && d.dateDevis && d.updatedAt
  );
  const delaiMoyen = devisAvecReponse.length > 0
    ? Math.round(devisAvecReponse.reduce((sum: number, d: any) => {
        const dateDevis = new Date(d.dateDevis);
        const dateReponse = new Date(d.updatedAt);
        return sum + differenceInDays(dateReponse, dateDevis);
      }, 0) / devisAvecReponse.length)
    : 0;

  // Montant moyen par devis
  const montantMoyen = totalDevis > 0 ? montantTotal / totalDevis : 0;

  // Comparaison avec période précédente
  const previousDateLimit = periode === "all" ? null : subDays(dateLimit!, parseInt(periode));
  const previousDevis = devisList?.filter((devis: any) => {
    if (!dateLimit || !previousDateLimit) return false;
    const devisDate = devis.dateDevis ? new Date(devis.dateDevis) : null;
    return devisDate && devisDate >= previousDateLimit && devisDate < dateLimit;
  }) || [];
  
  const previousAcceptes = previousDevis.filter((d: any) => d.statut === "accepte").length;
  const previousTraites = previousDevis.filter((d: any) => d.statut === "accepte" || d.statut === "refuse").length;
  const previousTauxConversion = previousTraites > 0 ? (previousAcceptes / previousTraites) * 100 : 0;
  const evolutionTaux = parseFloat(tauxConversion) - previousTauxConversion;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Statistiques Devis</h1>
          <p className="text-muted-foreground mt-1">
            Analysez les performances de vos devis
          </p>
        </div>
        <Select value={periode} onValueChange={setPeriode}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 derniers jours</SelectItem>
            <SelectItem value="30">30 derniers jours</SelectItem>
            <SelectItem value="90">3 derniers mois</SelectItem>
            <SelectItem value="365">12 derniers mois</SelectItem>
            <SelectItem value="all">Toute la période</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs principaux */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taux de conversion
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{tauxConversion}%</div>
            <div className="flex items-center gap-1 mt-1">
              {evolutionTaux > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : evolutionTaux < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : null}
              <span className={`text-sm ${evolutionTaux > 0 ? "text-green-600" : evolutionTaux < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                {evolutionTaux > 0 ? "+" : ""}{evolutionTaux.toFixed(1)}% vs période précédente
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Montant accepté
            </CardTitle>
            <Euro className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(montantAccepte)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              sur {formatCurrency(montantTotal)} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              En attente de réponse
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{devisEnvoyes}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCurrency(montantEnAttente)} en jeu
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Délai moyen de réponse
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{delaiMoyen} jours</div>
            <p className="text-sm text-muted-foreground mt-1">
              pour {devisAvecReponse.length} devis traités
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Répartition par statut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Répartition par statut</CardTitle>
            <CardDescription>Distribution des {totalDevis} devis sur la période</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>Acceptés</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{devisAcceptes}</span>
                  <Badge className="bg-green-100 text-green-700">
                    {totalDevis > 0 ? ((devisAcceptes / totalDevis) * 100).toFixed(0) : 0}%
                  </Badge>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full" 
                  style={{ width: `${totalDevis > 0 ? (devisAcceptes / totalDevis) * 100 : 0}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Envoyés (en attente)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{devisEnvoyes}</span>
                  <Badge className="bg-blue-100 text-blue-700">
                    {totalDevis > 0 ? ((devisEnvoyes / totalDevis) * 100).toFixed(0) : 0}%
                  </Badge>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full" 
                  style={{ width: `${totalDevis > 0 ? (devisEnvoyes / totalDevis) * 100 : 0}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span>Refusés</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{devisRefuses}</span>
                  <Badge className="bg-red-100 text-red-700">
                    {totalDevis > 0 ? ((devisRefuses / totalDevis) * 100).toFixed(0) : 0}%
                  </Badge>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-red-500 h-2 rounded-full" 
                  style={{ width: `${totalDevis > 0 ? (devisRefuses / totalDevis) * 100 : 0}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                  <span>Brouillons</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{devisBrouillons}</span>
                  <Badge className="bg-gray-100 text-gray-700">
                    {totalDevis > 0 ? ((devisBrouillons / totalDevis) * 100).toFixed(0) : 0}%
                  </Badge>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gray-400 h-2 rounded-full" 
                  style={{ width: `${totalDevis > 0 ? (devisBrouillons / totalDevis) * 100 : 0}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span>Expirés</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{devisExpires}</span>
                  <Badge className="bg-orange-100 text-orange-700">
                    {totalDevis > 0 ? ((devisExpires / totalDevis) * 100).toFixed(0) : 0}%
                  </Badge>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-orange-500 h-2 rounded-full" 
                  style={{ width: `${totalDevis > 0 ? (devisExpires / totalDevis) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analyse financière</CardTitle>
            <CardDescription>Répartition des montants par statut</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600 font-medium">Chiffre d'affaires sécurisé</p>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(montantAccepte)}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Potentiel en attente</p>
                    <p className="text-2xl font-bold text-blue-700">{formatCurrency(montantEnAttente)}</p>
                  </div>
                  <Clock className="h-8 w-8 text-blue-500" />
                </div>
              </div>

              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-600 font-medium">Montant perdu</p>
                    <p className="text-2xl font-bold text-red-700">{formatCurrency(montantPerdu)}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
              </div>

              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600 font-medium">Montant moyen par devis</p>
                    <p className="text-2xl font-bold text-purple-700">{formatCurrency(montantMoyen)}</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-purple-500" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Résumé */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé de la période</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-muted rounded-lg">
              <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-2xl font-bold">{totalDevis}</p>
              <p className="text-sm text-muted-foreground">Devis créés</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold text-green-600">{devisAcceptes}</p>
              <p className="text-sm text-muted-foreground">Acceptés</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <XCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
              <p className="text-2xl font-bold text-red-600">{devisRefuses}</p>
              <p className="text-sm text-muted-foreground">Refusés</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <Clock className="h-6 w-6 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold text-blue-600">{devisEnvoyes}</p>
              <p className="text-sm text-muted-foreground">En attente</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
