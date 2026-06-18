import { useState } from "react";
import { useLocation } from "@/shared/router/navigation";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useClientDetail, type ClientDetailVM } from "../application/use-client-detail";
import {
  activitesOfClient,
  computeClientStats,
  ofClient,
  sortActivitesByEcheance,
  type ActiviteType,
  type ClientDetail,
} from "../domain/client";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Badge } from "@/shared/ui/badge";
import { ArrowLeft, User, Phone, Mail, MapPin, FileText, Receipt, Calendar, TrendingUp, Euro, Clock, Globe, Loader2, Copy, ShieldOff, RefreshCw, Bell, Plus, Trash2, CheckCircle2, Circle, AlarmClock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// Détail client du FRONT NEUF (`/clients/:id`) — clean-archi : la PRÉSENTATION ne connaît plus le
// transport. Les données/mutations viennent du hook `useClientDetail` (couche application, seule à
// importer tRPC) ; les calculs (stats, filtrage par client, tri) viennent du domaine (`../domain/client`,
// fonctions pures testées). Parité visuelle stricte : JSX/Tailwind copiés à l'identique. Les couleurs de
// statut restent des classes Tailwind ; seuls les LABELS passent par i18n (namespace `clients`).
// Hooks remontés AVANT les early-returns (le legacy appelait des hooks après `if (!client) return`).

const devisStatusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoye: "bg-blue-100 text-blue-700",
  accepte: "bg-green-100 text-green-700",
  refuse: "bg-red-100 text-red-700",
  expire: "bg-orange-100 text-orange-700",
};

const factureStatusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  validee: "bg-amber-100 text-amber-800",
  envoyee: "bg-blue-100 text-blue-700",
  payee: "bg-green-100 text-green-700",
  en_retard: "bg-orange-100 text-orange-700",
  annulee: "bg-red-100 text-red-700",
};

const interventionStatusColors: Record<string, string> = {
  planifiee: "bg-blue-100 text-blue-700",
  en_cours: "bg-yellow-100 text-yellow-700",
  terminee: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
};

// Composant externe = SEULE porte de chargement (peu de hooks, stables) : on ne rend le contenu — qui
// porte tous les autres hooks — qu'UNE FOIS le client chargé. Évite le pattern « early-return après de
// nombreux hooks » (cause classique d'erreurs d'ordre de hooks / React #310).
export default function ClientDetailPage() {
  const { t } = useTranslation("clients");
  const { id } = useParams({ strict: false }) as { id?: string };
  const [, setLocation] = useLocation();
  const clientIdNum = parseInt(id || "0");

  // Tous les hooks (via la couche application) AVANT les early-returns → ordre de hooks stable.
  const vm = useClientDetail(clientIdNum);

  if (vm.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!vm.client) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">{t("notFoundTitle")}</h2>
        <Button variant="link" onClick={() => setLocation("/clients")}>
          {t("backToList")}
        </Button>
      </div>
    );
  }

  return <ClientDetailContent vm={vm} client={vm.client} clientIdNum={clientIdNum} />;
}

function ClientDetailContent({
  vm,
  client,
  clientIdNum,
}: {
  vm: ClientDetailVM;
  client: ClientDetail;
  clientIdNum: number;
}) {
  const { t } = useTranslation("clients");
  const [, setLocation] = useLocation();

  const {
    devis,
    factures,
    interventions,
    activites,
    portalStatus,
    generateAccess,
    deactivateAccess,
    createActivite,
    toggleActivite,
    deleteActivite,
  } = vm;

  const [activiteTitre, setActiviteTitre] = useState("");
  const [activiteEcheance, setActiviteEcheance] = useState("");
  const [activiteType, setActiviteType] = useState<ActiviteType>("appel");

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  // Sélections/calculs délégués au domaine (fonctions pures, testées).
  const devisClient = ofClient(devis, clientIdNum);
  const facturesClient = ofClient(factures, clientIdNum);
  const interventionsClient = ofClient(interventions, clientIdNum);
  const activitesClient = activitesOfClient(activites, clientIdNum);
  const { totalFacture, facturesImpayees, devisEnAttente, interventionsTerminees } =
    computeClientStats(devisClient, facturesClient, interventionsClient);

  // Effets UI (toasts/clipboard/reset) attachés par appel — la persistance/invalidation vit dans le hook.
  const handleGenerateAccess = () =>
    generateAccess.mutate(
      { clientId: clientIdNum },
      {
        onSuccess: (data) => {
          toast.success(t("toastPortalSent"));
          navigator.clipboard.writeText(data.url).catch(() => {});
        },
        onError: (err) => toast.error(err.message || t("toastPortalGenError")),
      },
    );
  const handleDeactivateAccess = () =>
    deactivateAccess.mutate(
      { clientId: clientIdNum },
      { onSuccess: () => toast.success(t("toastPortalDeactivated")) },
    );

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
          <p className="text-muted-foreground">{t("detailSubtitle")}</p>
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
                <p className="text-sm text-muted-foreground">{t("statTotalInvoiced")}</p>
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
                <p className="text-sm text-muted-foreground">{t("statUnpaid")}</p>
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
                <p className="text-sm text-muted-foreground">{t("statPendingQuotes")}</p>
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
                <p className="text-sm text-muted-foreground">{t("statInterventions")}</p>
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
              {t("infoTitle")}
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
                <p className="text-sm text-muted-foreground mb-2">{t("notesTitle")}</p>
                <p className="text-sm">{client.notes}</p>
              </div>
            )}

            <div className="pt-4 border-t space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">{t("quickActions")}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setLocation("/devis")}
              >
                <FileText className="h-4 w-4 mr-2" />
                {t("createQuote")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setLocation("/factures")}
              >
                <Receipt className="h-4 w-4 mr-2" />
                {t("createInvoice")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setLocation("/interventions")}
              >
                <Calendar className="h-4 w-4 mr-2" />
                {t("planIntervention")}
              </Button>
            </div>

            {/* Portail Client */}
            <div className="pt-4 border-t space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t("portalTitle")}
              </p>
              {portalStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm text-green-700 font-medium">{t("portalActive")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("portalExpires")} {format(new Date(portalStatus.dateExpiration), "dd/MM/yyyy")}
                    {portalStatus.lastAccessAt && (
                      <><br />{t("portalLastAccess")} {format(new Date(portalStatus.lastAccessAt), "dd/MM/yyyy à HH:mm", { locale: fr })}</>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        const url = `${window.location.origin}/portail/${portalStatus.token}`;
                        navigator.clipboard.writeText(url);
                        toast.success(t("toastLinkCopied"));
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      {t("copyLink")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleGenerateAccess()}
                      disabled={generateAccess.isPending}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      {t("renew")}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDeactivateAccess()}
                    disabled={deactivateAccess.isPending}
                  >
                    <ShieldOff className="h-3 w-3 mr-1" />
                    {t("deactivatePortal")}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => handleGenerateAccess()}
                  disabled={generateAccess.isPending || !client?.email}
                >
                  {generateAccess.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4 mr-2" />
                  )}
                  {client?.email ? t("sendPortalAccess") : t("emailRequiredPortal")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Historique */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="devis">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="devis">
                  {t("tabDevis", { n: devisClient.length })}
                </TabsTrigger>
                <TabsTrigger value="factures">
                  {t("tabFactures", { n: facturesClient.length })}
                </TabsTrigger>
                <TabsTrigger value="interventions">
                  {t("tabInterventions", { n: interventionsClient.length })}
                </TabsTrigger>
                <TabsTrigger value="activites">
                  {t("tabActivites", { n: activitesClient.filter((a) => !a.fait).length })}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="devis" className="mt-4">
                {devisClient.length > 0 ? (
                  <div className="space-y-3">
                    {devisClient.map((devis) => (
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
                              {t(`devisStatut_${devis.statut}`, { defaultValue: devis.statut })}
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
                    <p>{t("emptyDevis")}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="factures" className="mt-4">
                {facturesClient.length > 0 ? (
                  <div className="space-y-3">
                    {facturesClient.map((facture) => (
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
                              {t(`factureStatut_${facture.statut}`, { defaultValue: facture.statut })}
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
                    <p>{t("emptyFactures")}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="interventions" className="mt-4">
                {interventionsClient.length > 0 ? (
                  <div className="space-y-3">
                    {interventionsClient.map((intervention) => (
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
                            {t(`interventionStatut_${intervention.statut}`, { defaultValue: intervention.statut })}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t("emptyInterventions")}</p>
                  </div>
                )}
              </TabsContent>

              {/* Rappels / activités CRM rattachés à ce client */}
              <TabsContent value="activites" className="mt-4">
                <form
                  className="flex flex-col sm:flex-row gap-2 mb-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!activiteTitre.trim()) { toast.error(t("toastTitreRequired")); return; }
                    if (!activiteEcheance) { toast.error(t("toastEcheanceRequired")); return; }
                    createActivite.mutate(
                      {
                        titre: activiteTitre.trim(),
                        echeance: activiteEcheance,
                        type: activiteType,
                        entiteType: "client",
                        entiteId: clientIdNum,
                      },
                      {
                        onSuccess: () => {
                          toast.success(t("toastRappelAdded"));
                          setActiviteTitre("");
                          setActiviteEcheance("");
                          setActiviteType("appel");
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    );
                  }}
                >
                  <Input
                    placeholder={t("activitePlaceholder")}
                    value={activiteTitre}
                    onChange={(e) => setActiviteTitre(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={activiteEcheance}
                    onChange={(e) => setActiviteEcheance(e.target.value)}
                    className="sm:w-40"
                  />
                  <Select value={activiteType} onValueChange={(v) => setActiviteType(v as ActiviteType)}>
                    <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appel">{t("activiteType_appel")}</SelectItem>
                      <SelectItem value="email">{t("activiteType_email")}</SelectItem>
                      <SelectItem value="rdv">{t("activiteType_rdv")}</SelectItem>
                      <SelectItem value="relance">{t("activiteType_relance")}</SelectItem>
                      <SelectItem value="autre">{t("activiteType_autre")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" disabled={createActivite.isPending}>
                    <Plus className="h-4 w-4 mr-1" /> {t("add")}
                  </Button>
                </form>

                {activitesClient.length > 0 ? (
                  <div className="space-y-2">
                    {sortActivitesByEcheance(activitesClient)
                      .map((a) => (
                        <div key={a.id} className="flex items-start gap-2 p-3 rounded-lg border">
                          <button
                            type="button"
                            title={a.fait ? t("markTodo") : t("markDone")}
                            onClick={() => toggleActivite.mutate({ id: a.id, fait: !a.fait }, { onError: (e) => toast.error(e.message) })}
                            className="mt-0.5 shrink-0"
                          >
                            {a.fait
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              : <Circle className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${a.fait ? "line-through text-muted-foreground" : ""}`}>
                              {a.titre}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <AlarmClock className="h-3 w-3" />
                                {format(new Date(a.echeance), "dd MMM yyyy", { locale: fr })}
                              </span>
                              <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">
                                {t(`activiteType_${a.type}`, { defaultValue: a.type })}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            title={t("deleteTitle")}
                            onClick={() => deleteActivite.mutate({ id: a.id }, { onError: (e) => toast.error(e.message) })}
                            className="mt-0.5 shrink-0 text-muted-foreground hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t("emptyActivites")}</p>
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
