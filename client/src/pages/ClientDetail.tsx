import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Phone, Mail, MapPin, FileText, Receipt, Calendar, TrendingUp, Euro, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const devisStatusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
};

const devisStatusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoye: "bg-blue-100 text-blue-700",
  accepte: "bg-green-100 text-green-700",
  refuse: "bg-red-100 text-red-700",
  expire: "bg-orange-100 text-orange-700",
};

const factureStatusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const factureStatusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoyee: "bg-blue-100 text-blue-700",
  payee: "bg-green-100 text-green-700",
  en_retard: "bg-orange-100 text-orange-700",
  annulee: "bg-red-100 text-red-700",
};

const interventionStatusLabels: Record<string, string> = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

const interventionStatusColors: Record<string, string> = {
  planifiee: "bg-blue-100 text-blue-700",
  en_cours: "bg-yellow-100 text-yellow-700",
  terminee: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  
  const { data: client, isLoading } = trpc.clients.getById.useQuery(
    { id: parseInt(id || "0") },
    { enabled: !!id }
  );

  const { data: clientDevis } = trpc.devis.list.useQuery();
  const { data: clientFactures } = trpc.factures.list.useQuery();
  const { data: clientInterventions } = trpc.interventions.list.useQuery();

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Client non trouvé</h2>
        <Button variant="link" onClick={() => setLocation("/clients")}>
          Retour à la liste
        </Button>
      </div>
    );
  }

  // Filtrer les données pour ce client
  const devisClient = (clientDevis || []).filter((d: any) => d.clientId === parseInt(id || "0"));
  const facturesClient = (clientFactures || []).filter((f: any) => f.clientId === parseInt(id || "0"));
  const interventionsClient = (clientInterventions || []).filter((i: any) => i.clientId === parseInt(id || "0"));

  // Calculs des statistiques
  const totalFacture = facturesClient
    .filter((f: any) => f.statut === "payee")
    .reduce((sum: number, f: any) => sum + (parseFloat(f.totalTTC) || 0), 0);
  
  const facturesImpayees = facturesClient
    .filter((f: any) => f.statut !== "payee" && f.statut !== "annulee")
    .reduce((sum: number, f: any) => sum + (parseFloat(f.totalTTC) || 0), 0);

  const devisEnAttente = devisClient.filter((d: any) => d.statut === "envoye").length;
  const interventionsTerminees = interventionsClient.filter((i: any) => i.statut === "terminee").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/clients")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {client.nom} {client.prenom}
          </h1>
          <p className="text-muted-foreground">Fiche client complète</p>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100">
                <Euro className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total facturé</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalFacture)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-100">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Impayés</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(facturesImpayees)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Devis en attente</p>
                <p className="text-2xl font-bold text-blue-600">{devisEnAttente}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-100">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Interventions</p>
                <p className="text-2xl font-bold text-purple-600">{interventionsTerminees}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informations client */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {client.telephone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{client.telephone}</span>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{client.email}</span>
              </div>
            )}
            {(client.adresse || client.ville) && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  {client.adresse && <p>{client.adresse}</p>}
                  {(client.codePostal || client.ville) && (
                    <p>{client.codePostal} {client.ville}</p>
                  )}
                </div>
              </div>
            )}
            {client.notes && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Notes</p>
                <p className="text-sm">{client.notes}</p>
              </div>
            )}

            <div className="pt-4 border-t space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">Actions rapides</p>
              <Button 
                variant="outline" 
                size="sm"
                className="w-full justify-start"
                onClick={() => setLocation("/devis")}
              >
                <FileText className="h-4 w-4 mr-2" />
                Créer un devis
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="w-full justify-start"
                onClick={() => setLocation("/factures")}
              >
                <Receipt className="h-4 w-4 mr-2" />
                Créer une facture
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="w-full justify-start"
                onClick={() => setLocation("/interventions")}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Planifier une intervention
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Historique */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Historique</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="devis">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="devis">
                  Devis ({devisClient.length})
                </TabsTrigger>
                <TabsTrigger value="factures">
                  Factures ({facturesClient.length})
                </TabsTrigger>
                <TabsTrigger value="interventions">
                  Interventions ({interventionsClient.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="devis" className="mt-4">
                {devisClient.length > 0 ? (
                  <div className="space-y-3">
                    {devisClient.map((devis: any) => (
                      <button
                        key={devis.id}
                        onClick={() => setLocation(`/devis/${devis.id}`)}
                        className="w-full text-left p-4 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{devis.numero}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(devis.createdAt), "dd MMMM yyyy", { locale: fr })}
                            </p>
                            {devis.objet && (
                              <p className="text-sm text-muted-foreground mt-1">{devis.objet}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <Badge className={devisStatusColors[devis.statut] || "bg-gray-100"}>
                              {devisStatusLabels[devis.statut] || devis.statut}
                            </Badge>
                            <p className="text-lg font-semibold mt-1">
                              {formatCurrency(devis.totalTTC)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucun devis pour ce client</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="factures" className="mt-4">
                {facturesClient.length > 0 ? (
                  <div className="space-y-3">
                    {facturesClient.map((facture: any) => (
                      <button
                        key={facture.id}
                        onClick={() => setLocation(`/factures/${facture.id}`)}
                        className="w-full text-left p-4 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{facture.numero}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(facture.createdAt), "dd MMMM yyyy", { locale: fr })}
                            </p>
                            {facture.objet && (
                              <p className="text-sm text-muted-foreground mt-1">{facture.objet}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <Badge className={factureStatusColors[facture.statut] || "bg-gray-100"}>
                              {factureStatusLabels[facture.statut] || facture.statut}
                            </Badge>
                            <p className="text-lg font-semibold mt-1">
                              {formatCurrency(facture.totalTTC)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucune facture pour ce client</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="interventions" className="mt-4">
                {interventionsClient.length > 0 ? (
                  <div className="space-y-3">
                    {interventionsClient.map((intervention: any) => (
                      <div
                        key={intervention.id}
                        className="p-4 rounded-lg border"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{intervention.titre}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(intervention.dateDebut), "dd MMMM yyyy à HH:mm", { locale: fr })}
                            </p>
                            {intervention.adresse && (
                              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {intervention.adresse}
                              </p>
                            )}
                          </div>
                          <Badge className={interventionStatusColors[intervention.statut] || "bg-gray-100"}>
                            {interventionStatusLabels[intervention.statut] || intervention.statut}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucune intervention pour ce client</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
