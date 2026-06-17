import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FileText, Receipt, Calendar, User, Loader2, Phone, Mail, MessageCircle, CalendarDays, HardHat, Sparkles, Download, ExternalLink, CreditCard, MapPin, CheckCircle2, CheckCircle, Send, ArrowRight, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Badge } from "@/modern/shared/ui/badge";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Progress } from "@/modern/shared/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { usePortailAccess } from "../application/use-portail-access";
import { usePortailDocuments } from "../application/use-portail-documents";
import { usePortailActivity } from "../application/use-portail-activity";
import { usePortailRdv } from "../application/use-portail-rdv";
import { PORTAIL_TABS, formatCurrency, devisStatutClass, factureStatutClass, isFacturePayable, interventionStatutClass, chantierStatutClass, prochaineIntervention, groupSlotsByDay, rdvStatutClass, type RdvUrgence } from "../domain/portail";

// SLICE 1 (socle) du portail client `/v2/portail/$token` : gate d'accès (chargement / lien invalide /
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
              return (
                <TabsTrigger key={tab} value={tab} className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Icon className={`h-4 w-4 ${tab === "demande" ? "text-violet-600" : ""}`} />
                  {meta.prefix && <span className="hidden sm:inline">{t(meta.prefix)}</span>}{t(meta.label)}
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

          {/* Onglets restants (slices 5-6) — coquille */}
          {PORTAIL_TABS.filter((tab) => !["devis", "factures", "interventions", "chantier", "rdv"].includes(tab)).map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("sectionAVenir")}</CardContent>
              </Card>
            </TabsContent>
          ))}
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
