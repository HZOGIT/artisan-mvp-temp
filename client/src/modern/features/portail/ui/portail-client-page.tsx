import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FileText, Receipt, Calendar, User, Loader2, Phone, Mail, MessageCircle, CalendarDays, HardHat, Sparkles, Download, ExternalLink, CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Badge } from "@/modern/shared/ui/badge";
import { Button } from "@/modern/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { usePortailAccess } from "../application/use-portail-access";
import { usePortailDocuments } from "../application/use-portail-documents";
import { PORTAIL_TABS, formatCurrency, devisStatutClass, factureStatutClass, isFacturePayable } from "../domain/portail";

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

          {/* Onglets restants (slices 3-6) — coquille */}
          {PORTAIL_TABS.filter((tab) => tab !== "devis" && tab !== "factures").map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("sectionAVenir")}</CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
