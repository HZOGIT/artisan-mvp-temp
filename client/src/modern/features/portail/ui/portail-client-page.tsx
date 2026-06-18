import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FileText, Receipt, Calendar, User, Loader2, Phone, Mail, MessageCircle, CalendarDays, HardHat, Sparkles, Download, ExternalLink, CreditCard, MapPin, CheckCircle2, CheckCircle, Send, ArrowRight, ArrowLeft, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Badge } from "@/modern/shared/ui/badge";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Progress } from "@/modern/shared/ui/progress";
import { ScrollArea } from "@/modern/shared/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { usePortailAccess } from "../application/use-portail-access";
import { usePortailDocuments } from "../application/use-portail-documents";
import { usePortailActivity } from "../application/use-portail-activity";
import { usePortailRdv } from "../application/use-portail-rdv";
import { usePortailChat } from "../application/use-portail-chat";
import { usePortailInfos } from "../application/use-portail-infos";
import { usePortailDemande } from "../application/use-portail-demande";
import { PORTAIL_TABS, formatCurrency, devisStatutClass, factureStatutClass, isFacturePayable, interventionStatutClass, chantierStatutClass, prochaineIntervention, groupSlotsByDay, rdvStatutClass, totalUnread, formatChatDate, EXEMPLES_DEMANDE, demandeValide, type RdvUrgence, type DemandeStructured } from "../domain/portail";

// SLICE 1 (socle) du portail client `/portail/$token` : gate d'accès (chargement / lien invalide /
// espace valide) + en-tête artisan + coquille d'onglets. Contenu des onglets = slices ultérieurs.
// Composant additif PUBLIC, non lié au trafic réel tant que le backend n'a pas basculé les liens.
const TAB_ICON: Record<string, typeof FileText> = {
  demande: Sparkles, devis: FileText, factures: Receipt, interventions: Calendar,
  messages: MessageCircle, rdv: CalendarDays, chantier: HardHat, infos: User,
};
const TAB_LABEL: Record<string, { prefix?: string; label: string }> = {
  demande: { prefix: "tabDemandePrefix", label: "tabDemande" },
  devis: { prefix: "tabDevisPrefix", label: "tabDevis" },
  factures: { prefix: "tabFacturesPrefix", label: "tabFactures" },
  interventions: { prefix: "tabInterventionsPrefix", label: "tabInterventions" },
  messages: { label: "tabMessages" },
  rdv: { prefix: "tabRdvPrefix", label: "tabRdv" },
  chantier: { prefix: "tabChantierPrefix", label: "tabChantier" },
  infos: { prefix: "tabInfosPrefix", label: "tabInfos" },
};

export default function PortailClientPage() {
  const { t } = useTranslation("portail");
  const { token } = useParams({ strict: false }) as { token?: string };
  const [activeTab, setActiveTab] = useState("devis");
  const [payingFactureId, setPayingFactureId] = useState<number | null>(null);
  const { access, isLoading } = usePortailAccess(token || "");
  const { devis, factures } = usePortailDocuments(token || "", !!access?.valid);
  const { interventions, chantiers } = usePortailActivity(token || "", !!access?.valid);
  const prochaine = prochaineIntervention(interventions);
  const { creneaux, mesRdv, demanderRdv } = usePortailRdv(token || "", !!access?.valid);

  // Wizard RDV (état local UI).
  const [rdvStep, setRdvStep] = useState(1);
  const [rdvForm, setRdvForm] = useState<{ titre: string; description: string; urgence: RdvUrgence }>({ titre: "", description: "", urgence: "normale" });
  const [rdvSelectedSlot, setRdvSelectedSlot] = useState<string | null>(null);
  const [rdvSuccess, setRdvSuccess] = useState(false);

  const submitRdv = () => {
    if (!rdvSelectedSlot) return;
    demanderRdv.mutate(
      { token: token || "", titre: rdvForm.titre, description: rdvForm.description || undefined, urgence: rdvForm.urgence, dateProposee: rdvSelectedSlot },
      {
        onSuccess: () => { setRdvStep(1); setRdvForm({ titre: "", description: "", urgence: "normale" }); setRdvSelectedSlot(null); setRdvSuccess(true); setTimeout(() => setRdvSuccess(false), 5000); },
        onError: () => toast.error(t("rdvErreur")),
      },
    );
  };

  // Chat (slice 5)
  const [selectedChatConv, setSelectedChatConv] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { conversations, messages, sendMessage, refetchMessages, refetchConvs } = usePortailChat(token || "", !!access?.valid, selectedChatConv);
  const totalUnreadChat = totalUnread(conversations);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (!selectedChatConv) return;
    const id = setInterval(() => { refetchMessages(); refetchConvs(); }, 10000);
    return () => clearInterval(id);
  }, [selectedChatConv, refetchMessages, refetchConvs]);

  const submitChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !selectedChatConv) return;
    sendMessage.mutate(
      { token: token || "", conversationId: selectedChatConv, contenu: chatMessage.trim() },
      { onSuccess: () => setChatMessage(""), onError: () => toast.error(t("messageErreur")) },
    );
  };

  // Demande IA + Mes infos (slice 6)
  const { clientInfo } = usePortailInfos(token || "", !!access?.valid);
  const { soumettreDemandeIA, demanderModification } = usePortailDemande();
  const [demandeText, setDemandeText] = useState("");
  const [demandeStructured, setDemandeStructured] = useState<DemandeStructured | null>(null);
  const [modificationMessage, setModificationMessage] = useState("");
  const [modificationSent, setModificationSent] = useState(false);

  const submitDemande = () => {
    soumettreDemandeIA.mutate(
      { token: token || "", description: demandeText.trim() },
      { onSuccess: (data) => setDemandeStructured(data.structured), onError: () => toast.error(t("demandeErreur")) },
    );
  };
  const submitModification = () => {
    if (!modificationMessage.trim()) return;
    demanderModification.mutate(
      { token: token || "", message: modificationMessage },
      { onSuccess: () => { setModificationSent(true); setModificationMessage(""); }, onError: () => toast.error(t("infosModifErreur")) },
    );
  };

  // Retour de paiement Stripe (?paiement=succes|annule) → toast + onglet factures, puis nettoyage URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paiement") === "succes") {
      toast.success(t("paiementSucces"));
      setActiveTab("factures");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("paiement") === "annule") {
      toast.error(t("paiementAnnule"));
      setActiveTab("factures");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [t]);

  const handlePayerEnLigne = async (factureId: number) => {
    if (!token) return;
    setPayingFactureId(factureId);
    try {
      const resp = await fetch("/api/paiement/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factureId, token }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.detail || data.error || t("paiementErreur"));
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error(t("paiementConnexion"));
    } finally {
      setPayingFactureId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">{t("chargement")}</p>
        </div>
      </div>
    );
  }

  if (!access?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-red-600">{t("lienInvalideTitre")}</CardTitle>
            <CardDescription className="text-base">{t("lienInvalideDesc")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {access.artisan?.logo && <img src={access.artisan.logo} alt="" className="h-10 w-10 rounded object-contain" />}
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{access.artisan?.nomEntreprise || t("espaceClient")}</h1>
                <p className="text-gray-500 text-sm mt-1">{t("bienvenue", { prenom: access.client?.prenom ?? "", nom: access.client?.nom ?? "" })}</p>
              </div>
            </div>
            <div className="text-sm text-gray-500 sm:text-right">
              {access.artisan?.telephone && <p className="flex items-center gap-1 sm:justify-end"><Phone className="h-3.5 w-3.5" /> {access.artisan.telephone}</p>}
              {access.artisan?.email && <p className="flex items-center gap-1 sm:justify-end"><Mail className="h-3.5 w-3.5" /> {access.artisan.email}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-8 mb-6">
            {PORTAIL_TABS.map((tab) => {
              const Icon = TAB_ICON[tab];
              const meta = TAB_LABEL[tab];
              const count = tab === "devis" ? devis.length : tab === "factures" ? factures.length : 0;
              return (
                <TabsTrigger key={tab} value={tab} className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Icon className={`h-4 w-4 ${tab === "demande" ? "text-violet-600" : ""}`} />
                  {meta.prefix && <span className="hidden sm:inline">{t(meta.prefix)}</span>}{t(meta.label)}
                  {count > 0 && <span className="ml-1 bg-gray-200 text-gray-700 text-xs rounded-full px-1.5">{count}</span>}
                  {tab === "messages" && totalUnreadChat > 0 && <span className="ml-1 bg-blue-600 text-white text-xs rounded-full px-1.5">{totalUnreadChat}</span>}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* SLICE 2 — Devis */}
          <TabsContent value="devis">
            <div className="space-y-3">
              {devis.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-gray-500"><FileText className="h-12 w-12 mx-auto mb-4 opacity-40" /><p>{t("aucunDevis")}</p></CardContent></Card>
              ) : (
                devis.map((d) => (
                  <Card key={d.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold text-gray-900">{d.numero}</span>
                            <Badge variant="outline" className={devisStatutClass(d.statut || "brouillon")}>{t(`devisStatut.${d.statut || "brouillon"}`, d.statut || "")}</Badge>
                          </div>
                          {d.objet && <p className="text-sm text-gray-500 truncate">{d.objet}</p>}
                          <p className="text-xs text-gray-400 mt-1">{d.dateCreation && format(new Date(d.dateCreation), "dd MMMM yyyy", { locale: fr })}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg text-gray-900 whitespace-nowrap">{formatCurrency(d.totalTTC)}</span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <a href={`/api/portail/${token}/devis/${d.id}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-1" />{t("pdf")}</a>
                            </Button>
                            {d.tokenSignature && d.statut === "envoye" && (
                              <Button size="sm" asChild>
                                <a href={`/signature/${d.tokenSignature}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" />{t("signer")}</a>
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

          {/* SLICE 2 — Factures + paiement Stripe */}
          <TabsContent value="factures">
            <div className="space-y-3">
              {factures.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-gray-500"><Receipt className="h-12 w-12 mx-auto mb-4 opacity-40" /><p>{t("aucuneFacture")}</p></CardContent></Card>
              ) : (
                factures.map((f) => (
                  <Card key={f.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold text-gray-900">{f.numero}</span>
                            <Badge variant="outline" className={factureStatutClass(f.statut || "envoyee")}>{t(`factureStatut.${f.statut || "envoyee"}`, f.statut || "")}</Badge>
                          </div>
                          {f.objet && <p className="text-sm text-gray-500 truncate">{f.objet}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            {f.dateCreation && format(new Date(f.dateCreation), "dd MMMM yyyy", { locale: fr })}
                            {f.dateEcheance && <span className="ml-2">— {t("echeance", { date: format(new Date(f.dateEcheance), "dd/MM/yyyy") })}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg text-gray-900 whitespace-nowrap">{formatCurrency(f.totalTTC)}</span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <a href={`/api/portail/${token}/factures/${f.id}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-1" />{t("pdf")}</a>
                            </Button>
                            {isFacturePayable(f.statut || "") && (
                              <Button size="sm" onClick={() => handlePayerEnLigne(f.id)} disabled={payingFactureId === f.id} className="bg-green-600 hover:bg-green-700">
                                {payingFactureId === f.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
                                {t("payerEnLigne")}
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

          {/* SLICE 3 — Interventions */}
          <TabsContent value="interventions">
            <div className="space-y-3">
              {prochaine && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-blue-600 font-medium text-xs uppercase tracking-wider">{t("prochaineIntervention")}</CardDescription>
                    <CardTitle className="text-lg text-blue-900">{prochaine.titre}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 text-blue-700"><Calendar className="h-4 w-4" />{format(new Date(prochaine.dateIntervention), "EEEE dd MMMM yyyy 'à' HH:mm", { locale: fr })}</div>
                      {prochaine.adresse && <div className="flex items-center gap-2 text-blue-600"><MapPin className="h-4 w-4" />{prochaine.adresse}</div>}
                    </div>
                  </CardContent>
                </Card>
              )}
              {interventions.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-gray-500"><Calendar className="h-12 w-12 mx-auto mb-4 opacity-40" /><p>{t("aucuneIntervention")}</p></CardContent></Card>
              ) : (
                interventions.filter((i) => i.id !== prochaine?.id).map((i) => (
                  <Card key={i.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold text-gray-900">{i.titre}</span>
                            <Badge variant="outline" className={interventionStatutClass(i.statut || "planifiee")}>{t(`interventionStatut.${i.statut || "planifiee"}`, i.statut || "")}</Badge>
                          </div>
                          {i.description && <p className="text-sm text-gray-500 truncate">{i.description}</p>}
                        </div>
                        <div className="text-sm text-gray-500 whitespace-nowrap">
                          <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{i.dateIntervention && format(new Date(i.dateIntervention), "dd MMM yyyy 'à' HH:mm", { locale: fr })}</div>
                          {i.adresse && <div className="flex items-center gap-1.5 mt-1"><MapPin className="h-3.5 w-3.5" />{i.adresse}</div>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* SLICE 3 — Suivi chantiers */}
          <TabsContent value="chantier">
            <div className="space-y-6">
              {chantiers.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><HardHat className="h-12 w-12 mx-auto text-gray-300 mb-4" /><p className="text-gray-500">{t("aucunChantier")}</p></CardContent></Card>
              ) : (
                chantiers.map((chantier) => (
                  <Card key={chantier.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{chantier.nom}</CardTitle>
                          {chantier.description && <CardDescription>{chantier.description}</CardDescription>}
                        </div>
                        <Badge className={chantierStatutClass(chantier.statut || "planifie")}>{(chantier.statut || "planifie").replace("_", " ")}</Badge>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">{t("avancementGlobal")}</span>
                          <span className="font-semibold">{chantier.avancement || 0}%</span>
                        </div>
                        <Progress value={chantier.avancement || 0} className="h-3" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {chantier.etapes && chantier.etapes.length > 0 ? (
                        <div className="space-y-4">
                          <h4 className="font-semibold text-sm text-gray-700">{t("etapesChantier")}</h4>
                          <div className="relative">
                            {chantier.etapes.map((etape, idx) => (
                              <div key={etape.id} className="flex gap-4 pb-6 last:pb-0">
                                <div className="flex flex-col items-center">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${etape.statut === "termine" ? "bg-green-500 text-white" : etape.statut === "en_cours" ? "bg-blue-500 text-white animate-pulse" : "bg-gray-200 text-gray-500"}`}>
                                    {etape.statut === "termine" ? <CheckCircle2 className="h-4 w-4" /> : etape.ordre}
                                  </div>
                                  {idx < chantier.etapes.length - 1 && <div className={`w-0.5 flex-1 mt-1 ${etape.statut === "termine" ? "bg-green-300" : "bg-gray-200"}`} />}
                                </div>
                                <div className="flex-1 pt-1">
                                  <div className="flex items-center justify-between">
                                    <h5 className={`font-medium ${etape.statut === "termine" ? "text-green-700" : etape.statut === "en_cours" ? "text-blue-700" : "text-gray-600"}`}>{etape.titre}</h5>
                                    <span className="text-sm font-semibold">{etape.pourcentage}%</span>
                                  </div>
                                  {etape.description && <p className="text-sm text-gray-500 mt-0.5">{etape.description}</p>}
                                  <Progress value={etape.pourcentage || 0} className="h-1.5 mt-2" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm text-center py-4">{t("etapesBientot")}</p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* SLICE 4 — Prise de RDV (wizard 3 étapes + mes RDV) */}
          <TabsContent value="rdv">
            <div className="space-y-6">
              {rdvSuccess && (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="py-6 text-center">
                    <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-600" />
                    <p className="font-medium text-green-800">{t("rdvEnvoyeeTitre")}</p>
                    <p className="text-sm text-green-600 mt-1">{t("rdvEnvoyeeDesc")}</p>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-center gap-2 mb-4">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rdvStep >= step ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"}`}>{step}</div>
                    <span className={`text-xs hidden sm:inline ${rdvStep >= step ? "text-blue-600 font-medium" : "text-gray-400"}`}>{step === 1 ? t("rdvStep1") : step === 2 ? t("rdvStep2") : t("rdvStep3")}</span>
                    {step < 3 && <ArrowRight className="h-3.5 w-3.5 text-gray-300 mx-1" />}
                  </div>
                ))}
              </div>

              {rdvStep === 1 && (
                <Card>
                  <CardHeader><CardTitle>{t("rdvDecrivez")}</CardTitle><CardDescription>{t("rdvDecrivezDesc")}</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">{t("rdvTitre")}</label>
                      <Input value={rdvForm.titre} onChange={(e) => setRdvForm((f) => ({ ...f, titre: e.target.value }))} placeholder={t("rdvTitrePlaceholder")} className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t("rdvDescription")}</label>
                      <Textarea value={rdvForm.description} onChange={(e) => setRdvForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("rdvDescriptionPlaceholder")} rows={3} className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t("rdvUrgence")}</label>
                      <Select value={rdvForm.urgence} onValueChange={(v) => setRdvForm((f) => ({ ...f, urgence: v as RdvUrgence }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normale">{t("urgence.normale")}</SelectItem>
                          <SelectItem value="urgente">{t("urgence.urgente")}</SelectItem>
                          <SelectItem value="tres_urgente">{t("urgence.tres_urgente")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={() => setRdvStep(2)} disabled={!rdvForm.titre.trim()} className="w-full">{t("rdvChoisirCreneau")} <ArrowRight className="h-4 w-4 ml-2" /></Button>
                  </CardContent>
                </Card>
              )}

              {rdvStep === 2 && (
                <Card>
                  <CardHeader><CardTitle>{t("rdvChoisissez")}</CardTitle><CardDescription>{t("rdvChoisissezDesc")}</CardDescription></CardHeader>
                  <CardContent>
                    {creneaux.length === 0 ? (
                      <div className="text-center py-8 text-gray-500"><CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" /><p>{t("rdvAucunCreneau")}</p></div>
                    ) : (
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                        {Object.entries(groupSlotsByDay(creneaux)).map(([day, daySlots]) => (
                          <div key={day}>
                            <h4 className="font-medium text-sm mb-2 capitalize">{new Date(day + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h4>
                            <div className="flex flex-wrap gap-2">
                              {daySlots.map((slot) => (
                                <Button key={slot} size="sm" variant={rdvSelectedSlot === slot ? "default" : "outline"} onClick={() => setRdvSelectedSlot(slot)} className="min-w-[70px]">
                                  {new Date(slot).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                </Button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-6">
                      <Button variant="outline" onClick={() => setRdvStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> {t("rdvRetour")}</Button>
                      <Button onClick={() => setRdvStep(3)} disabled={!rdvSelectedSlot} className="flex-1">{t("rdvContinuer")} <ArrowRight className="h-4 w-4 ml-2" /></Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {rdvStep === 3 && (
                <Card>
                  <CardHeader><CardTitle>{t("rdvConfirmez")}</CardTitle><CardDescription>{t("rdvConfirmezDesc")}</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                      <p><strong>{t("rdvLabelTitre")}</strong> {rdvForm.titre}</p>
                      {rdvForm.description && <p><strong>{t("rdvLabelDescription")}</strong> {rdvForm.description}</p>}
                      <p><strong>{t("rdvLabelUrgence")}</strong> {t(`urgence.${rdvForm.urgence}`)}</p>
                      <p><strong>{t("rdvLabelCreneau")}</strong> {rdvSelectedSlot && new Date(rdvSelectedSlot).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setRdvStep(2)}><ArrowLeft className="h-4 w-4 mr-1" /> {t("rdvRetour")}</Button>
                      <Button className="flex-1" onClick={submitRdv} disabled={demanderRdv.isPending}>
                        {demanderRdv.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("rdvEnvoi")}</> : <><Send className="h-4 w-4 mr-2" /> {t("rdvEnvoyer")}</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {mesRdv.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>{t("rdvMesRdv")}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {mesRdv.map((rdv) => (
                        <div key={rdv.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{rdv.titre}</p>
                            <p className="text-sm text-gray-500">{new Date(rdv.dateProposee).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          <Badge className={rdvStatutClass(rdv.statut || "en_attente")}>{t(`rdvStatut.${rdv.statut || "en_attente"}`, rdv.statut || "")}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* SLICE 5 — Messages / Chat */}
          <TabsContent value="messages">
            <div className="grid gap-4 sm:grid-cols-3" style={{ minHeight: "500px" }}>
              <Card className={`${selectedChatConv ? "hidden sm:flex" : "flex"} flex-col`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2"><MessageCircle className="h-5 w-5 text-blue-600" />{t("conversations")}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    {conversations.length === 0 ? (
                      <div className="p-6 text-center text-gray-500"><MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm">{t("aucuneConversation")}</p></div>
                    ) : (
                      <div className="space-y-1 p-2">
                        {conversations.map((conv) => (
                          <button key={conv.id} onClick={() => setSelectedChatConv(conv.id)} className={`w-full p-3 rounded-lg text-left transition-colors ${selectedChatConv === conv.id ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50"}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm truncate">{conv.sujet || t("conversation")}</span>
                              {(conv.nonLuClient || 0) > 0 && <Badge className="ml-2 shrink-0 bg-blue-600">{conv.nonLuClient}</Badge>}
                            </div>
                            {conv.dernierMessage && <p className="text-xs text-gray-500 truncate mt-1">{conv.dernierMessage}</p>}
                            {conv.dernierMessageDate && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />{formatChatDate(conv.dernierMessageDate)}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className={`sm:col-span-2 ${selectedChatConv ? "flex" : "hidden sm:flex"} flex-col`}>
                {selectedChatConv ? (
                  <>
                    <CardHeader className="pb-2 border-b">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setSelectedChatConv(null)}><ArrowLeft className="h-5 w-5" /></Button>
                        <CardTitle className="text-lg">{conversations.find((c) => c.id === selectedChatConv)?.sujet || t("conversation")}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
                      <ScrollArea className="flex-1 p-4" style={{ maxHeight: "400px" }}>
                        <div className="space-y-3">
                          {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.auteur === "client" ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[75%] rounded-lg p-3 ${msg.auteur === "client" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.contenu}</p>
                                <p className={`text-xs mt-1 ${msg.auteur === "client" ? "text-blue-200" : "text-gray-400"}`}>{formatChatDate(msg.createdAt)}</p>
                              </div>
                            </div>
                          ))}
                          <div ref={chatEndRef} />
                        </div>
                      </ScrollArea>
                      <div className="p-3 border-t">
                        <form onSubmit={submitChat} className="flex gap-2">
                          <Input value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder={t("votreMessage")} className="flex-1" />
                          <Button type="submit" disabled={!chatMessage.trim() || sendMessage.isPending}><Send className="h-4 w-4" /></Button>
                        </form>
                      </div>
                    </CardContent>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 py-16">
                    <div className="text-center"><MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-30" /><p>{t("selectionnezConversation")}</p></div>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* SLICE 6 — Nouvelle demande IA */}
          <TabsContent value="demande">
            <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" />{t("demandeTitre")}</CardTitle>
                <CardDescription>{t("demandeDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {EXEMPLES_DEMANDE.map((ex) => (
                    <button key={ex} type="button" onClick={() => setDemandeText(ex)} className="text-xs px-3 py-1.5 rounded-full border border-violet-200 bg-white hover:bg-violet-100 text-violet-700 transition-colors">{ex}</button>
                  ))}
                </div>
                <Textarea value={demandeText} onChange={(e) => setDemandeText(e.target.value)} placeholder={t("demandePlaceholder")} rows={5} className="bg-white" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("demandeCompteur", { count: demandeText.length })}</span>
                  <Button onClick={submitDemande} disabled={!demandeValide(demandeText) || soumettreDemandeIA.isPending} className="bg-violet-600 hover:bg-violet-700">
                    {soumettreDemandeIA.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("demandeEnvoi")}</> : <><Send className="h-4 w-4 mr-2" /> {t("demandeEnvoyer")}</>}
                  </Button>
                </div>

                {demandeStructured && (
                  <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-emerald-900">{t("demandeEnvoyeeTitre")}</p>
                        <p className="text-xs text-emerald-700">{t("demandeEnvoyeeDesc")}</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-md p-3 space-y-2 text-sm">
                      <div><span className="font-semibold">{t("demandeLabelTitre")}</span> {demandeStructured.titre}</div>
                      <div><span className="font-semibold">{t("demandeLabelType")}</span> {demandeStructured.typeTravaux}</div>
                      <div><span className="font-semibold">{t("demandeLabelUrgence")}</span> <Badge variant={demandeStructured.urgence === "urgente" ? "destructive" : "secondary"}>{t(`urgence.${demandeStructured.urgence}`, demandeStructured.urgence)}</Badge></div>
                      {demandeStructured.estimationMin !== null && demandeStructured.estimationMax !== null && (
                        <div>
                          <span className="font-semibold">{t("demandeLabelEstimation")}</span> <span className="text-violet-700 font-semibold">{demandeStructured.estimationMin}€ – {demandeStructured.estimationMax}€</span>
                          <span className="text-xs text-muted-foreground ml-2">{t("demandeEstimationConfirmer")}</span>
                        </div>
                      )}
                      <div>
                        <span className="font-semibold">{t("demandeLabelReformulee")}</span>
                        <p className="mt-1 text-gray-700">{demandeStructured.descriptionReformulee}</p>
                      </div>
                      {demandeStructured.questions.length > 0 && (
                        <div>
                          <span className="font-semibold">{t("demandeLabelQuestions")}</span>
                          <ul className="mt-1 list-disc list-inside text-gray-700">{demandeStructured.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SLICE 6 — Mes infos + demande de modification */}
          <TabsContent value="infos">
            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5 text-blue-600" />{t("infosCoordonnees")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {clientInfo ? (
                    <>
                      <div><span className="text-sm text-gray-500">{t("infosNom")}</span><p className="font-medium">{clientInfo.prenom} {clientInfo.nom}</p></div>
                      {clientInfo.email && <div><span className="text-sm text-gray-500">{t("infosEmail")}</span><p className="font-medium">{clientInfo.email}</p></div>}
                      {clientInfo.telephone && <div><span className="text-sm text-gray-500">{t("infosTelephone")}</span><p className="font-medium">{clientInfo.telephone}</p></div>}
                      {(clientInfo.adresse || clientInfo.ville) && (
                        <div>
                          <span className="text-sm text-gray-500">{t("infosAdresse")}</span>
                          <p className="font-medium">{clientInfo.adresse}{(clientInfo.codePostal || clientInfo.ville) && <><br />{clientInfo.codePostal} {clientInfo.ville}</>}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-500">{t("chargement")}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><Send className="h-5 w-5 text-blue-600" />{t("infosModifTitre")}</CardTitle>
                  <CardDescription>{t("infosModifDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {modificationSent ? (
                    <div className="text-center py-4">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                      <p className="text-green-700 font-medium">{t("infosModifEnvoye")}</p>
                      <p className="text-sm text-gray-500 mt-1">{t("infosModifNotifie")}</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setModificationSent(false)}>{t("infosModifAutre")}</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Textarea placeholder={t("infosModifPlaceholder")} value={modificationMessage} onChange={(e) => setModificationMessage(e.target.value)} rows={4} />
                      <Button className="w-full" disabled={!modificationMessage.trim() || demanderModification.isPending} onClick={submitModification}>
                        {demanderModification.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}{t("infosModifEnvoyer")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="bg-white border-t mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
            <div className="text-center sm:text-left">
              <p className="font-medium text-gray-700">{access.artisan?.nomEntreprise}</p>
              {access.artisan?.adresse && <p>{access.artisan.adresse}, {access.artisan?.codePostal} {access.artisan?.ville}</p>}
              {access.artisan?.siret && <p>{t("siret", { siret: access.artisan.siret })}</p>}
            </div>
            <div className="text-center sm:text-right">
              {access.artisan?.telephone && <p>{access.artisan.telephone}</p>}
              {access.artisan?.email && <p>{access.artisan.email}</p>}
              <p className="text-xs text-gray-400 mt-1">{t("portailSecurise")}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
