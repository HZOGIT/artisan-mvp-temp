import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Receipt, Calendar, User, Download, ExternalLink, Send, Loader2, CheckCircle, MapPin, Phone, Mail, MessageCircle, ArrowLeft, Clock, CalendarDays, ArrowRight, HardHat, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const { data: suiviChantiers } = trpc.clientPortal.getSuiviChantiers.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  // Chat state
  const [selectedChatConv, setSelectedChatConv] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: chatConversations, refetch: refetchChatConvs } = trpc.clientPortal.getConversations.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  const { data: chatMessages, refetch: refetchChatMessages } = trpc.clientPortal.getConversationMessages.useQuery(
    { token: token || "", conversationId: selectedChatConv! },
    { enabled: !!token && accessData?.valid && !!selectedChatConv }
  );

  const sendClientMessage = trpc.clientPortal.sendClientMessage.useMutation({
    onSuccess: () => {
      setChatMessage("");
      refetchChatMessages();
      refetchChatConvs();
    },
    onError: () => toast.error("Erreur lors de l'envoi du message"),
  });

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

  // RDV state
  const [rdvStep, setRdvStep] = useState(1);
  const [rdvForm, setRdvForm] = useState({ titre: "", description: "", urgence: "normale" as "normale" | "urgente" | "tres_urgente" });
  const [rdvSelectedSlot, setRdvSelectedSlot] = useState<string | null>(null);
  const [rdvSuccess, setRdvSuccess] = useState(false);

  const { data: creneauxDisponibles } = trpc.clientPortal.getCreneauxDisponibles.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  const { data: mesRdv, refetch: refetchMesRdv } = trpc.clientPortal.getMesRdv.useQuery(
    { token: token || "" },
    { enabled: !!token && accessData?.valid }
  );

  const demanderRdvMutation = trpc.clientPortal.demanderRdv.useMutation({
    onSuccess: () => {
      setRdvStep(1);
      setRdvForm({ titre: "", description: "", urgence: "normale" });
      setRdvSelectedSlot(null);
      setRdvSuccess(true);
      refetchMesRdv();
      setTimeout(() => setRdvSuccess(false), 5000);
    },
    onError: () => toast.error("Erreur lors de la demande de RDV"),
  });

  function groupSlotsByDay(slots: string[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    for (const slot of slots) {
      const day = new Date(slot).toISOString().split('T')[0];
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(slot);
    }
    return grouped;
  }

  const RDV_STATUT_LABELS: Record<string, string> = { en_attente: "En attente", confirme: "Confirmé", refuse: "Refusé", annule: "Annulé" };
  const RDV_STATUT_COLORS: Record<string, string> = { en_attente: "bg-yellow-100 text-yellow-700", confirme: "bg-green-100 text-green-700", refuse: "bg-red-100 text-red-700", annule: "bg-gray-100 text-gray-500" };

  // Auto-scroll chat messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Poll for new messages
  useEffect(() => {
    if (selectedChatConv) {
      const interval = setInterval(() => {
        refetchChatMessages();
        refetchChatConvs();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [selectedChatConv, refetchChatMessages, refetchChatConvs]);

  const totalUnreadChat = (chatConversations || []).reduce((sum, c) => sum + (c.nonLuClient || 0), 0);

  const formatChatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (days === 1) return "Hier";
    if (days < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

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
            <div className="flex items-center gap-3">
              {accessData.artisan?.logo && (
                <img src={accessData.artisan.logo} alt="" className="h-10 w-10 rounded object-contain" />
              )}
              <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {accessData.artisan?.nomEntreprise || "Espace Client"}
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Bienvenue, {accessData.client?.prenom} {accessData.client?.nom}
              </p>
              </div>
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
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 mb-6">
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
            <TabsTrigger value="messages" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <MessageCircle className="h-4 w-4" />
              Messages
              {totalUnreadChat > 0 && (
                <span className="ml-1 bg-blue-600 text-white text-xs rounded-full px-1.5">{totalUnreadChat}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="rdv" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Prendre </span>RDV
            </TabsTrigger>
            <TabsTrigger value="chantier" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <HardHat className="h-4 w-4" />
              <span className="hidden sm:inline">Mon </span>Chantier
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

          {/* Messages Tab */}
          <TabsContent value="messages">
            <div className="grid gap-4 sm:grid-cols-3" style={{ minHeight: "500px" }}>
              {/* Conversation list */}
              <Card className={`${selectedChatConv ? "hidden sm:flex" : "flex"} flex-col`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-blue-600" />
                    Conversations
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    {!chatConversations || chatConversations.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Aucune conversation</p>
                      </div>
                    ) : (
                      <div className="space-y-1 p-2">
                        {chatConversations.map((conv) => (
                          <button
                            key={conv.id}
                            onClick={() => setSelectedChatConv(conv.id)}
                            className={`w-full p-3 rounded-lg text-left transition-colors ${
                              selectedChatConv === conv.id ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm truncate">{conv.sujet || "Conversation"}</span>
                              {(conv.nonLuClient || 0) > 0 && (
                                <Badge className="ml-2 shrink-0 bg-blue-600">{conv.nonLuClient}</Badge>
                              )}
                            </div>
                            {conv.dernierMessage && (
                              <p className="text-xs text-gray-500 truncate mt-1">{conv.dernierMessage}</p>
                            )}
                            {conv.dernierMessageDate && (
                              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />{formatChatDate(conv.dernierMessageDate)}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Message thread */}
              <Card className={`sm:col-span-2 ${selectedChatConv ? "flex" : "hidden sm:flex"} flex-col`}>
                {selectedChatConv ? (
                  <>
                    <CardHeader className="pb-2 border-b">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setSelectedChatConv(null)}>
                          <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <CardTitle className="text-lg">
                          {chatConversations?.find((c) => c.id === selectedChatConv)?.sujet || "Conversation"}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
                      <ScrollArea className="flex-1 p-4" style={{ maxHeight: "400px" }}>
                        <div className="space-y-3">
                          {chatMessages?.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.auteur === "client" ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[75%] rounded-lg p-3 ${
                                msg.auteur === "client" ? "bg-blue-600 text-white" : "bg-gray-100"
                              }`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.contenu}</p>
                                <p className={`text-xs mt-1 ${msg.auteur === "client" ? "text-blue-200" : "text-gray-400"}`}>
                                  {formatChatDate(msg.createdAt)}
                                </p>
                              </div>
                            </div>
                          ))}
                          <div ref={chatEndRef} />
                        </div>
                      </ScrollArea>
                      <div className="p-3 border-t">
                        <form onSubmit={(e) => {
                          e.preventDefault();
                          if (!chatMessage.trim() || !selectedChatConv) return;
                          sendClientMessage.mutate({
                            token: token || "",
                            conversationId: selectedChatConv,
                            contenu: chatMessage.trim(),
                          });
                        }} className="flex gap-2">
                          <Input
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            placeholder="Votre message..."
                            className="flex-1"
                          />
                          <Button type="submit" disabled={!chatMessage.trim() || sendClientMessage.isPending}>
                            <Send className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    </CardContent>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 py-16">
                    <div className="text-center">
                      <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>Sélectionnez une conversation</p>
                    </div>
                  </div>
                )}
              </Card>
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

          {/* RDV Tab */}
          <TabsContent value="rdv">
            <div className="space-y-6">
              {/* Success message */}
              {rdvSuccess && (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="py-6 text-center">
                    <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-600" />
                    <p className="font-medium text-green-800">Votre demande de RDV a été envoyée !</p>
                    <p className="text-sm text-green-600 mt-1">L'artisan vous confirmera le créneau.</p>
                  </CardContent>
                </Card>
              )}

              {/* Wizard Step Indicator */}
              <div className="flex items-center justify-center gap-2 mb-4">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rdvStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                      {step}
                    </div>
                    <span className={`text-xs hidden sm:inline ${rdvStep >= step ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                      {step === 1 ? 'Description' : step === 2 ? 'Créneau' : 'Confirmation'}
                    </span>
                    {step < 3 && <ArrowRight className="h-3.5 w-3.5 text-gray-300 mx-1" />}
                  </div>
                ))}
              </div>

              {/* Step 1: Form */}
              {rdvStep === 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Décrivez votre besoin</CardTitle>
                    <CardDescription>Expliquez le problème ou la prestation souhaitée</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Titre du problème *</label>
                      <Input
                        value={rdvForm.titre}
                        onChange={(e) => setRdvForm((f) => ({ ...f, titre: e.target.value }))}
                        placeholder="Ex: Fuite robinet cuisine"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={rdvForm.description}
                        onChange={(e) => setRdvForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Détails supplémentaires sur le problème..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Niveau d'urgence</label>
                      <Select value={rdvForm.urgence} onValueChange={(v) => setRdvForm((f) => ({ ...f, urgence: v as any }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normale">Normale</SelectItem>
                          <SelectItem value="urgente">Urgente</SelectItem>
                          <SelectItem value="tres_urgente">Très urgente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={() => setRdvStep(2)} disabled={!rdvForm.titre.trim()} className="w-full">
                      Choisir un créneau <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 2: Calendar with slots */}
              {rdvStep === 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Choisissez un créneau</CardTitle>
                    <CardDescription>Créneaux disponibles sur les 14 prochains jours (lun-ven, 8h-18h)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!creneauxDisponibles || creneauxDisponibles.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        <p>Aucun créneau disponible pour le moment</p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                        {Object.entries(groupSlotsByDay(creneauxDisponibles)).map(([day, daySlots]) => (
                          <div key={day}>
                            <h4 className="font-medium text-sm mb-2 capitalize">
                              {new Date(day + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {daySlots.map((slot) => (
                                <Button
                                  key={slot}
                                  size="sm"
                                  variant={rdvSelectedSlot === slot ? "default" : "outline"}
                                  onClick={() => setRdvSelectedSlot(slot)}
                                  className="min-w-[70px]"
                                >
                                  {new Date(slot).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </Button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-6">
                      <Button variant="outline" onClick={() => setRdvStep(1)}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Retour
                      </Button>
                      <Button onClick={() => setRdvStep(3)} disabled={!rdvSelectedSlot} className="flex-1">
                        Continuer <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Step 3: Confirmation */}
              {rdvStep === 3 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Confirmez votre demande</CardTitle>
                    <CardDescription>Vérifiez les informations avant d'envoyer</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                      <p><strong>Titre :</strong> {rdvForm.titre}</p>
                      {rdvForm.description && <p><strong>Description :</strong> {rdvForm.description}</p>}
                      <p><strong>Urgence :</strong> {rdvForm.urgence === 'normale' ? 'Normale' : rdvForm.urgence === 'urgente' ? 'Urgente' : 'Très urgente'}</p>
                      <p><strong>Créneau :</strong> {rdvSelectedSlot && new Date(rdvSelectedSlot).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setRdvStep(2)}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Retour
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() =>
                          demanderRdvMutation.mutate({
                            token: token || "",
                            titre: rdvForm.titre,
                            description: rdvForm.description || undefined,
                            urgence: rdvForm.urgence,
                            dateProposee: rdvSelectedSlot!,
                          })
                        }
                        disabled={demanderRdvMutation.isPending}
                      >
                        {demanderRdvMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi...</>
                        ) : (
                          <><Send className="h-4 w-4 mr-2" /> Envoyer la demande</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Mes RDV existants */}
              {mesRdv && mesRdv.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Mes rendez-vous</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {mesRdv.map((rdv: any) => (
                        <div key={rdv.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{rdv.titre}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(rdv.dateProposee).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <Badge className={RDV_STATUT_COLORS[rdv.statut] || "bg-gray-100"}>
                            {RDV_STATUT_LABELS[rdv.statut] || rdv.statut}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Mon Chantier Tab */}
          <TabsContent value="chantier">
            <div className="space-y-6">
              {(!suiviChantiers || suiviChantiers.length === 0) ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <HardHat className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">Aucun chantier en cours pour le moment.</p>
                  </CardContent>
                </Card>
              ) : (
                suiviChantiers.map((chantier: any) => (
                  <Card key={chantier.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{chantier.nom}</CardTitle>
                          {chantier.description && (
                            <CardDescription>{chantier.description}</CardDescription>
                          )}
                        </div>
                        <Badge className={
                          chantier.statut === "termine" ? "bg-green-100 text-green-800" :
                          chantier.statut === "en_cours" ? "bg-blue-100 text-blue-800" :
                          chantier.statut === "en_pause" ? "bg-yellow-100 text-yellow-800" :
                          "bg-gray-100 text-gray-800"
                        }>
                          {(chantier.statut || "planifie").replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">Avancement global</span>
                          <span className="font-semibold">{chantier.avancement || 0}%</span>
                        </div>
                        <Progress value={chantier.avancement || 0} className="h-3" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {chantier.etapes && chantier.etapes.length > 0 ? (
                        <div className="space-y-4">
                          <h4 className="font-semibold text-sm text-gray-700">Etapes du chantier</h4>
                          <div className="relative">
                            {chantier.etapes.map((etape: any, idx: number) => (
                              <div key={etape.id} className="flex gap-4 pb-6 last:pb-0">
                                {/* Vertical timeline line */}
                                <div className="flex flex-col items-center">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                    etape.statut === "termine" ? "bg-green-500 text-white" :
                                    etape.statut === "en_cours" ? "bg-blue-500 text-white animate-pulse" :
                                    "bg-gray-200 text-gray-500"
                                  }`}>
                                    {etape.statut === "termine" ? <CheckCircle2 className="h-4 w-4" /> : etape.ordre}
                                  </div>
                                  {idx < chantier.etapes.length - 1 && (
                                    <div className={`w-0.5 flex-1 mt-1 ${
                                      etape.statut === "termine" ? "bg-green-300" : "bg-gray-200"
                                    }`} />
                                  )}
                                </div>
                                {/* Content */}
                                <div className="flex-1 pt-1">
                                  <div className="flex items-center justify-between">
                                    <h5 className={`font-medium ${etape.statut === "termine" ? "text-green-700" : etape.statut === "en_cours" ? "text-blue-700" : "text-gray-600"}`}>
                                      {etape.titre}
                                    </h5>
                                    <span className="text-sm font-semibold">{etape.pourcentage}%</span>
                                  </div>
                                  {etape.description && (
                                    <p className="text-sm text-gray-500 mt-0.5">{etape.description}</p>
                                  )}
                                  <Progress value={etape.pourcentage || 0} className="h-1.5 mt-2" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm text-center py-4">Les etapes de suivi seront bientot disponibles.</p>
                      )}
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
