import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Receipt, Calendar, User, Download, ExternalLink, Send, Loader2, CheckCircle, MapPin, Phone, Mail } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export default function PortailClient() {
  const { token } = useParams<{ token: string }>();
  const [activeTab, setActiveTab] = useState("devis");
  const [modificationMessage, setModificationMessage] = useState("");
  const [modificationSent, setModificationSent] = useState(false);

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

  const { data: clientInfo } = trpc.clientPortal.getClientInfo.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  const demanderModification = trpc.clientPortal.demanderModification.useMutation({
    onSuccess: () => {
      setModificationSent(true);
      setModificationMessage("");
      toast.success("Votre demande a été envoyée");
    },
    onError: () => {
      toast.error("Erreur lors de l'envoi de la demande");
    },
  });

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Chargement de votre espace client...</p>
        </div>
      </div>
    );
  }

  if (!accessData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-red-600">Lien expiré ou invalide</CardTitle>
            <CardDescription className="text-base">
              Ce lien d'accès n'est plus valide. Veuillez contacter votre artisan pour obtenir un nouveau lien d'accès à votre espace client.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getDevisStatutBadge = (statut: string) => {
    const config: Record<string, { className: string; label: string }> = {
      brouillon: { className: "bg-gray-100 text-gray-700 border-gray-200", label: "Brouillon" },
      envoye: { className: "bg-blue-100 text-blue-700 border-blue-200", label: "Envoyé" },
      accepte: { className: "bg-green-100 text-green-700 border-green-200", label: "Accepté" },
      refuse: { className: "bg-red-100 text-red-700 border-red-200", label: "Refusé" },
      expire: { className: "bg-orange-100 text-orange-700 border-orange-200", label: "Expiré" },
    };
    const c = config[statut] || { className: "bg-gray-100 text-gray-700", label: statut };
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const getFactureStatutBadge = (statut: string) => {
    const config: Record<string, { className: string; label: string }> = {
      brouillon: { className: "bg-gray-100 text-gray-700 border-gray-200", label: "Brouillon" },
      envoyee: { className: "bg-blue-100 text-blue-700 border-blue-200", label: "En attente" },
      payee: { className: "bg-green-100 text-green-700 border-green-200", label: "Payée" },
      en_retard: { className: "bg-red-100 text-red-700 border-red-200", label: "En retard" },
      annulee: { className: "bg-gray-100 text-gray-500 border-gray-200", label: "Annulée" },
    };
    const c = config[statut] || { className: "bg-gray-100 text-gray-700", label: statut };
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const getInterventionStatutBadge = (statut: string) => {
    const config: Record<string, { className: string; label: string }> = {
      planifiee: { className: "bg-blue-100 text-blue-700 border-blue-200", label: "Planifiée" },
      en_cours: { className: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "En cours" },
      terminee: { className: "bg-green-100 text-green-700 border-green-200", label: "Terminée" },
      annulee: { className: "bg-red-100 text-red-700 border-red-200", label: "Annulée" },
    };
    const c = config[statut] || { className: "bg-gray-100 text-gray-700", label: statut };
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  };

  // Find next upcoming intervention
  const now = new Date();
  const prochaineIntervention = interventionsList
    ?.filter((i) => new Date(i.dateIntervention) >= now && i.statut === "planifiee")
    .sort((a, b) => new Date(a.dateIntervention).getTime() - new Date(b.dateIntervention).getTime())[0];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {accessData.artisan?.nomEntreprise || "Espace Client"}
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Bienvenue, {accessData.client?.prenom} {accessData.client?.nom}
              </p>
            </div>
            <div className="text-sm text-gray-500 sm:text-right">
              {accessData.artisan?.telephone && (
                <p className="flex items-center gap-1 sm:justify-end"><Phone className="h-3.5 w-3.5" /> {accessData.artisan.telephone}</p>
              )}
              {accessData.artisan?.email && (
                <p className="flex items-center gap-1 sm:justify-end"><Mail className="h-3.5 w-3.5" /> {accessData.artisan.email}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6">
            <TabsTrigger value="devis" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Mes </span>Devis
              {devisList && devisList.length > 0 && (
                <span className="ml-1 bg-gray-200 text-gray-700 text-xs rounded-full px-1.5">{devisList.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="factures" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Mes </span>Factures
              {facturesList && facturesList.length > 0 && (
                <span className="ml-1 bg-gray-200 text-gray-700 text-xs rounded-full px-1.5">{facturesList.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="interventions" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Mes </span>Interventions
            </TabsTrigger>
            <TabsTrigger value="infos" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Mes </span>Infos
            </TabsTrigger>
          </TabsList>

          {/* Devis Tab */}
          <TabsContent value="devis">
            <div className="space-y-3">
              {!devisList || devisList.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p>Aucun devis pour le moment</p>
                  </CardContent>
                </Card>
              ) : (
                devisList.map((devis) => (
                  <Card key={devis.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold text-gray-900">{devis.numero}</span>
                            {getDevisStatutBadge(devis.statut || "brouillon")}
                          </div>
                          {devis.objet && (
                            <p className="text-sm text-gray-500 truncate">{devis.objet}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {devis.dateCreation && format(new Date(devis.dateCreation), "dd MMMM yyyy", { locale: fr })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg text-gray-900 whitespace-nowrap">
                            {formatCurrency(devis.totalTTC)}
                          </span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                            >
                              <a href={`/api/portail/${token}/devis/${devis.id}/pdf`} target="_blank" rel="noopener noreferrer">
                                <Download className="h-4 w-4 mr-1" />
                                PDF
                              </a>
                            </Button>
                            {devis.tokenSignature && devis.statut === "envoye" && (
                              <Button size="sm" asChild>
                                <a href={`/signature/${devis.tokenSignature}`} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  Signer
                                </a>
                              </Button>
                            )}
                          </div>
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
            <div className="space-y-3">
              {!facturesList || facturesList.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Receipt className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p>Aucune facture pour le moment</p>
                  </CardContent>
                </Card>
              ) : (
                facturesList.map((facture) => (
                  <Card key={facture.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold text-gray-900">{facture.numero}</span>
                            {getFactureStatutBadge(facture.statut || "envoyee")}
                          </div>
                          {facture.objet && (
                            <p className="text-sm text-gray-500 truncate">{facture.objet}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {facture.dateCreation && format(new Date(facture.dateCreation), "dd MMMM yyyy", { locale: fr })}
                            {facture.dateEcheance && (
                              <span className="ml-2">
                                — Échéance : {format(new Date(facture.dateEcheance), "dd/MM/yyyy")}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg text-gray-900 whitespace-nowrap">
                            {formatCurrency(facture.totalTTC)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                          >
                            <a href={`/api/portail/${token}/factures/${facture.id}/pdf`} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 mr-1" />
                              PDF
                            </a>
                          </Button>
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
            <div className="space-y-3">
              {/* Prochaine intervention mise en avant */}
              {prochaineIntervention && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-blue-600 font-medium text-xs uppercase tracking-wider">
                      Prochaine intervention
                    </CardDescription>
                    <CardTitle className="text-lg text-blue-900">{prochaineIntervention.titre}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 text-blue-700">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(prochaineIntervention.dateIntervention), "EEEE dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                      </div>
                      {prochaineIntervention.adresse && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <MapPin className="h-4 w-4" />
                          {prochaineIntervention.adresse}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {!interventionsList || interventionsList.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p>Aucune intervention pour le moment</p>
                  </CardContent>
                </Card>
              ) : (
                interventionsList
                  .filter((i) => i.id !== prochaineIntervention?.id)
                  .map((intervention) => (
                    <Card key={intervention.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-semibold text-gray-900">{intervention.titre}</span>
                              {getInterventionStatutBadge(intervention.statut || "planifiee")}
                            </div>
                            {intervention.description && (
                              <p className="text-sm text-gray-500 truncate">{intervention.description}</p>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              {intervention.dateIntervention &&
                                format(new Date(intervention.dateIntervention), "dd MMM yyyy 'à' HH:mm", { locale: fr })}
                            </div>
                            {intervention.adresse && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {intervention.adresse}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          </TabsContent>

          {/* Mes Informations Tab */}
          <TabsContent value="infos">
            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-600" />
                    Mes coordonnées
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clientInfo ? (
                    <>
                      <div>
                        <span className="text-sm text-gray-500">Nom</span>
                        <p className="font-medium">{clientInfo.prenom} {clientInfo.nom}</p>
                      </div>
                      {clientInfo.email && (
                        <div>
                          <span className="text-sm text-gray-500">Email</span>
                          <p className="font-medium">{clientInfo.email}</p>
                        </div>
                      )}
                      {clientInfo.telephone && (
                        <div>
                          <span className="text-sm text-gray-500">Téléphone</span>
                          <p className="font-medium">{clientInfo.telephone}</p>
                        </div>
                      )}
                      {(clientInfo.adresse || clientInfo.ville) && (
                        <div>
                          <span className="text-sm text-gray-500">Adresse</span>
                          <p className="font-medium">
                            {clientInfo.adresse}
                            {(clientInfo.codePostal || clientInfo.ville) && (
                              <><br />{clientInfo.codePostal} {clientInfo.ville}</>
                            )}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-500">Chargement...</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Send className="h-5 w-5 text-blue-600" />
                    Demander une modification
                  </CardTitle>
                  <CardDescription>
                    Si vos informations ne sont pas à jour, envoyez une demande de modification à votre artisan.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {modificationSent ? (
                    <div className="text-center py-4">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                      <p className="text-green-700 font-medium">Demande envoyée avec succès !</p>
                      <p className="text-sm text-gray-500 mt-1">Votre artisan a été notifié par email.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => setModificationSent(false)}
                      >
                        Envoyer une autre demande
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Textarea
                        placeholder="Décrivez les modifications souhaitées (ex: nouvelle adresse, nouveau numéro de téléphone...)"
                        value={modificationMessage}
                        onChange={(e) => setModificationMessage(e.target.value)}
                        rows={4}
                      />
                      <Button
                        className="w-full"
                        disabled={!modificationMessage.trim() || demanderModification.isPending}
                        onClick={() => demanderModification.mutate({ token: token || "", message: modificationMessage })}
                      >
                        {demanderModification.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Envoyer la demande
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
            <div className="text-center sm:text-left">
              <p className="font-medium text-gray-700">{accessData.artisan?.nomEntreprise}</p>
              {accessData.artisan?.adresse && (
                <p>{accessData.artisan.adresse}, {accessData.artisan?.codePostal} {accessData.artisan?.ville}</p>
              )}
              {accessData.artisan?.siret && (
                <p>SIRET : {accessData.artisan.siret}</p>
              )}
            </div>
            <div className="text-center sm:text-right">
              {accessData.artisan?.telephone && <p>{accessData.artisan.telephone}</p>}
              {accessData.artisan?.email && <p>{accessData.artisan.email}</p>}
              <p className="text-xs text-gray-400 mt-1">Portail client sécurisé</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
