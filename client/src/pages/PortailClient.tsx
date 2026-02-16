import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Receipt, Calendar, Building2, ExternalLink, CreditCard, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function PortailClient() {
  const { token } = useParams<{ token: string }>();
  const [activeTab, setActiveTab] = useState("devis");

  const { data: accessData, isLoading: accessLoading } = trpc.clientPortal.verifyAccess.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  const { data: devisList } = trpc.clientPortal.getDevis.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  const { data: facturesList } = trpc.clientPortal.getFactures.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  const { data: interventionsList } = trpc.clientPortal.getInterventions.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  const { data: contratsList } = trpc.clientPortal.getContrats.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!accessData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Accès non autorisé</CardTitle>
            <CardDescription>
              Ce lien d'accès est invalide ou a expiré. Veuillez contacter votre artisan pour obtenir un nouveau lien.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getStatutBadge = (statut: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      brouillon: { variant: "secondary", label: "Brouillon" },
      envoye: { variant: "default", label: "Envoyé" },
      accepte: { variant: "default", label: "Accepté" },
      refuse: { variant: "destructive", label: "Refusé" },
      payee: { variant: "default", label: "Payée" },
      envoyee: { variant: "secondary", label: "En attente" },
      en_retard: { variant: "destructive", label: "En retard" },
      planifiee: { variant: "secondary", label: "Planifiée" },
      en_cours: { variant: "default", label: "En cours" },
      terminee: { variant: "default", label: "Terminée" },
      annulee: { variant: "destructive", label: "Annulée" },
      actif: { variant: "default", label: "Actif" },
      suspendu: { variant: "secondary", label: "Suspendu" },
      termine: { variant: "outline", label: "Terminé" },
      annule: { variant: "destructive", label: "Annulé" },
    };
    const config = variants[statut] || { variant: "outline" as const, label: statut };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {accessData.artisan?.nomEntreprise || "Portail Client"}
              </h1>
              <p className="text-gray-600">
                Bienvenue, {accessData.client?.prenom} {accessData.client?.nom}
              </p>
            </div>
            <div className="text-right text-sm text-gray-500">
              {accessData.artisan?.telephone && (
                <p>Tél: {accessData.artisan.telephone}</p>
              )}
              {accessData.artisan?.email && (
                <p>{accessData.artisan.email}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="devis" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Devis ({devisList?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="factures" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Factures ({facturesList?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="interventions" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Interventions ({interventionsList?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="contrats" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Contrats ({contratsList?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Devis Tab */}
          <TabsContent value="devis">
            <div className="grid gap-4">
              {devisList?.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-gray-500">
                    Aucun devis pour le moment
                  </CardContent>
                </Card>
              ) : (
                devisList?.map((devis) => (
                  <Card key={devis.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{devis.numero}</CardTitle>
                        {getStatutBadge(devis.statut || "brouillon")}
                      </div>
                      <CardDescription>{devis.objet}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                          {devis.dateCreation && format(new Date(devis.dateCreation), "dd MMMM yyyy", { locale: fr })}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold text-lg">
                            {parseFloat(devis.totalTTC || "0").toFixed(2)} €
                          </span>
                          {devis.tokenSignature && devis.statut === "envoye" && (
                            <Button size="sm" asChild>
                              <a href={`/signature/${devis.tokenSignature}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Signer
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Factures Tab */}
          <TabsContent value="factures">
            <div className="grid gap-4">
              {facturesList?.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-gray-500">
                    Aucune facture pour le moment
                  </CardContent>
                </Card>
              ) : (
                facturesList?.map((facture) => (
                  <Card key={facture.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{facture.numero}</CardTitle>
                        {getStatutBadge(facture.statut || "envoyee")}
                      </div>
                      <CardDescription>{facture.objet}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                          {facture.dateCreation && format(new Date(facture.dateCreation), "dd MMMM yyyy", { locale: fr })}
                          {facture.dateEcheance && (
                            <span className="ml-2">
                              • Échéance: {format(new Date(facture.dateEcheance), "dd/MM/yyyy")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold text-lg">
                            {parseFloat(facture.totalTTC || "0").toFixed(2)} €
                          </span>
                          {facture.lienPaiement && facture.statut !== "payee" && (
                            <Button size="sm" asChild>
                              <a href={facture.lienPaiement} target="_blank" rel="noopener noreferrer">
                                <CreditCard className="h-4 w-4 mr-2" />
                                Payer
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Interventions Tab */}
          <TabsContent value="interventions">
            <div className="grid gap-4">
              {interventionsList?.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-gray-500">
                    Aucune intervention pour le moment
                  </CardContent>
                </Card>
              ) : (
                interventionsList?.map((intervention) => (
                  <Card key={intervention.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{intervention.titre}</CardTitle>
                        {getStatutBadge(intervention.statut || "planifiee")}
                      </div>
                      {intervention.description && (
                        <CardDescription>{intervention.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <div>
                          {intervention.dateIntervention && 
                            format(new Date(intervention.dateIntervention), "EEEE dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                        </div>
                        {intervention.adresse && (
                          <div>{intervention.adresse}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Contrats Tab */}
          <TabsContent value="contrats">
            <div className="grid gap-4">
              {contratsList?.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-gray-500">
                    Aucun contrat de maintenance pour le moment
                  </CardContent>
                </Card>
              ) : (
                contratsList?.map((contrat) => (
                  <Card key={contrat.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{contrat.reference} - {contrat.titre}</CardTitle>
                        {getStatutBadge(contrat.statut || "actif")}
                      </div>
                      {contrat.description && (
                        <CardDescription>{contrat.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Périodicité:</span>{" "}
                          <span className="capitalize">{contrat.periodicite}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Montant:</span>{" "}
                          <span className="font-semibold">
                            {parseFloat(contrat.montantHT || "0").toFixed(2)} € HT
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Début:</span>{" "}
                          {contrat.dateDebut && format(new Date(contrat.dateDebut), "dd/MM/yyyy")}
                        </div>
                        {contrat.prochainFacturation && (
                          <div>
                            <span className="text-gray-500">Prochaine facturation:</span>{" "}
                            {format(new Date(contrat.prochainFacturation), "dd/MM/yyyy")}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-gray-500">
          Portail client sécurisé • {accessData.artisan?.nomEntreprise}
        </div>
      </footer>
    </div>
  );
}
