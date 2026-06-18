import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Download, FileText, Loader2, Plus, Calendar, CheckCircle, XCircle, Clock, Wrench, Receipt, AlertTriangle } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Badge } from "@/modern/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modern/shared/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/modern/shared/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modern/shared/ui/table";
import { useContratDetail } from "../application/use-contrat-detail";
import { TYPE_LABEL_KEY, PERIODICITE_LABEL_KEY, STATUT_INTERVENTION, statutContratVariant, montantsContrat, defaultInterventionForm, buildCreateInterventionPayload, type InterventionForm } from "../domain/contrat-detail";

const INTER_ICON: Record<string, typeof Calendar> = { planifiee: Calendar, en_cours: Clock, effectuee: CheckCircle, annulee: XCircle };

// Page `/contrats/:id` — migration clean-archi de `pages/ContratDetail.tsx`. Markup à l'identique.
export default function ContratDetailPage() {
  const { t } = useTranslation("contratDetail");
  const { id: idParam } = useParams({ strict: false }) as { id?: string };
  const contratId = parseInt(idParam || "0");
  const { contrat, client, isLoading, refetch, interventions, refetchInterventions, generateFacture, suspendre, reactiver, createIntervention, updateIntervention } = useContratDetail(contratId);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<InterventionForm>(defaultInterventionForm);

  const goBack = () => { window.location.href = "/contrats"; };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!contrat) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" />{t("retour")}</Button>
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">{t("contratNonTrouve")}</p></CardContent></Card>
      </div>
    );
  }

  const m = montantsContrat(contrat.montantHT, contrat.tauxTVA);
  // ⚠️ FINDING : pas d'endpoint backend pour les factures récurrentes d'un contrat (le legacy lisait
  // `contrat.facturesRecurrentes`, toujours undefined → onglet toujours vide). Parité = liste vide.
  const factures: never[] = [];

  const genFacture = () => generateFacture.mutate({ contratId: contrat.id }, { onSuccess: () => { toast.success(t("toastFactureGeneree")); refetch(); }, onError: (e) => toast.error(e.message) });
  const doSuspendre = () => suspendre.mutate({ id: contrat.id }, { onSuccess: () => { toast.success(t("toastSuspendu")); refetch(); }, onError: (e) => toast.error(e.message) });
  const doReactiver = () => reactiver.mutate({ id: contrat.id }, { onSuccess: () => { toast.success(t("toastReactive")); refetch(); }, onError: (e) => toast.error(e.message) });
  const setInterStatut = (id: number, statut: "effectuee" | "annulee") => updateIntervention.mutate({ id, contratId, statut }, { onSuccess: () => { toast.success(t("toastInterMaj")); refetchInterventions(); }, onError: (e) => toast.error(e.message) });
  const submitIntervention = () => {
    if (!form.titre || !form.dateIntervention) { toast.error(t("errTitreDate")); return; }
    createIntervention.mutate(buildCreateInterventionPayload(contratId, form), {
      onSuccess: () => { toast.success(t("toastInterPlanifiee")); setShowDialog(false); setForm(defaultInterventionForm()); refetchInterventions(); },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{contrat.reference}</h1>
              <Badge variant={statutContratVariant(contrat.statut || "actif")}>{t(`statut.${contrat.statut || "actif"}`)}</Badge>
              <Badge variant="outline">{t(TYPE_LABEL_KEY[contrat.type || "entretien"])}</Badge>
            </div>
            <p className="text-muted-foreground">{contrat.titre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild><a href={`/api/contrats/${contrat.id}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-2" />{t("pdf")}</a></Button>
          <Button size="sm" onClick={genFacture} disabled={generateFacture.isPending || contrat.statut !== "actif"}>
            {generateFacture.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}{t("genererFacture")}
          </Button>
          {contrat.statut === "actif" && (<Button variant="outline" size="sm" className="text-orange-600" onClick={doSuspendre}>{t("suspendre")}</Button>)}
          {contrat.statut === "suspendu" && (<Button variant="outline" size="sm" className="text-green-600" onClick={doReactiver}>{t("reactiver")}</Button>)}
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("tabDetails")}</TabsTrigger>
          <TabsTrigger value="interventions">{t("tabInterventions")} {interventions.length ? `(${interventions.length})` : ""}</TabsTrigger>
          <TabsTrigger value="factures">{t("tabFactures")} {factures.length ? `(${factures.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">{t("infosContrat")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">{t("reference")}</span><span className="font-medium">{contrat.reference}</span>
                  <span className="text-muted-foreground">{t("type")}</span><span>{t(TYPE_LABEL_KEY[contrat.type || "entretien"])}</span>
                  <span className="text-muted-foreground">{t("periodicite")}</span><span>{t(PERIODICITE_LABEL_KEY[contrat.periodicite])}</span>
                  <span className="text-muted-foreground">{t("dateDebut")}</span><span>{format(new Date(contrat.dateDebut), "dd MMMM yyyy", { locale: fr })}</span>
                  <span className="text-muted-foreground">{t("dateFin")}</span><span>{contrat.dateFin ? format(new Date(contrat.dateFin), "dd MMMM yyyy", { locale: fr }) : t("indeterminee")}</span>
                  <span className="text-muted-foreground">{t("reconduction")}</span><span>{contrat.reconduction ? t("tacite") : t("non")}</span>
                  <span className="text-muted-foreground">{t("preavisResiliation")}</span><span>{t("moisCount", { n: contrat.preavisResiliation || 1 })}</span>
                  <span className="text-muted-foreground">{t("prochaineFacturation")}</span><span className="font-medium">{contrat.prochainFacturation ? format(new Date(contrat.prochainFacturation), "dd/MM/yyyy") : "-"}</span>
                  {contrat.prochainPassage && (<><span className="text-muted-foreground">{t("prochainPassage")}</span><span className="font-medium">{format(new Date(contrat.prochainPassage), "dd/MM/yyyy")}</span></>)}
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-lg">{t("montants")}</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">{t("montantHT")}</span><span className="font-medium">{m.ht.toFixed(2)} €</span>
                    <span className="text-muted-foreground">{t("tvaTaux", { taux: m.taux })}</span><span>{m.tva.toFixed(2)} €</span>
                    <span className="text-muted-foreground font-medium">{t("montantTTC")}</span><span className="font-bold text-primary">{m.ttc.toFixed(2)} €</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">{t("client")}</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p className="font-medium">{client?.prenom} {client?.nom}</p>
                  {client?.email && <p className="text-muted-foreground">{client.email}</p>}
                  {client?.telephone && <p className="text-muted-foreground">{client.telephone}</p>}
                  {client?.adresse && (<p className="text-muted-foreground">{client.adresse}{client.codePostal ? `, ${client.codePostal} ${client.ville || ""}` : ""}</p>)}
                </CardContent>
              </Card>
            </div>
          </div>
          {contrat.description && (<Card><CardHeader><CardTitle className="text-lg">{t("descriptionPrestations")}</CardTitle></CardHeader><CardContent><p className="text-sm whitespace-pre-wrap">{contrat.description}</p></CardContent></Card>)}
          {contrat.conditionsParticulieres && (<Card><CardHeader><CardTitle className="text-lg">{t("conditionsParticulieres")}</CardTitle></CardHeader><CardContent><p className="text-sm whitespace-pre-wrap">{contrat.conditionsParticulieres}</p></CardContent></Card>)}
          {contrat.notes && (<Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t("notesInternes")}</CardTitle></CardHeader><CardContent><p className="text-sm whitespace-pre-wrap">{contrat.notes}</p></CardContent></Card>)}
        </TabsContent>

        <TabsContent value="interventions" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t("interventionsLiees")}</h3>
            <Button size="sm" onClick={() => setShowDialog(true)} disabled={contrat.statut !== "actif"}><Plus className="h-4 w-4 mr-2" />{t("planifier")}</Button>
          </div>
          {!interventions.length ? (
            <Card><CardContent className="py-12 text-center"><Wrench className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">{t("aucuneIntervention")}</p><Button className="mt-4" size="sm" onClick={() => setShowDialog(true)} disabled={contrat.statut !== "actif"}><Plus className="h-4 w-4 mr-2" />{t("planifierIntervention")}</Button></CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>{t("colDate")}</TableHead><TableHead>{t("colTitre")}</TableHead><TableHead>{t("colTechnicien")}</TableHead><TableHead>{t("colDuree")}</TableHead><TableHead>{t("colStatut")}</TableHead><TableHead className="text-right">{t("colActions")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {interventions.map((inter) => {
                    const cfg = STATUT_INTERVENTION[inter.statut || "planifiee"] ?? STATUT_INTERVENTION.planifiee;
                    const Icon = INTER_ICON[inter.statut || "planifiee"] ?? Calendar;
                    return (
                      <TableRow key={inter.id}>
                        <TableCell>{format(new Date(inter.dateIntervention), "dd/MM/yyyy")}</TableCell>
                        <TableCell><div><p className="font-medium">{inter.titre}</p>{inter.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{inter.description}</p>}</div></TableCell>
                        <TableCell>{inter.technicienNom || "-"}</TableCell>
                        <TableCell>{inter.duree || "-"}</TableCell>
                        <TableCell><Badge variant="outline" className={cfg.color}><Icon className="h-3 w-3 mr-1" />{t(cfg.labelKey)}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {inter.statut === "planifiee" && (<Button variant="ghost" size="sm" onClick={() => setInterStatut(inter.id, "effectuee")}><CheckCircle className="h-3.5 w-3.5 mr-1" />{t("valider")}</Button>)}
                            {inter.statut === "planifiee" && (<Button variant="ghost" size="sm" className="text-red-600" onClick={() => setInterStatut(inter.id, "annulee")}><XCircle className="h-3.5 w-3.5 mr-1" />{t("annuler")}</Button>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("dialogTitre")}</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>{t("champTitre")}</Label><Input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder={t("champTitrePlaceholder")} /></div>
                <div className="space-y-2"><Label>{t("champDescription")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("champDescriptionPlaceholder")} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t("champDate")}</Label><Input type="date" value={form.dateIntervention} onChange={(e) => setForm({ ...form, dateIntervention: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("champDuree")}</Label><Input value={form.duree} onChange={(e) => setForm({ ...form, duree: e.target.value })} placeholder={t("champDureePlaceholder")} /></div>
                </div>
                <div className="space-y-2"><Label>{t("champTechnicien")}</Label><Input value={form.technicienNom} onChange={(e) => setForm({ ...form, technicienNom: e.target.value })} placeholder={t("champTechnicienPlaceholder")} /></div>
                <div className="space-y-2"><Label>{t("champNotes")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("champNotesPlaceholder")} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDialog(false)}>{t("annuler")}</Button>
                <Button onClick={submitIntervention} disabled={createIntervention.isPending}>{createIntervention.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{t("planifier")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="factures" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t("facturesGenerees")}</h3>
            <Button size="sm" onClick={genFacture} disabled={generateFacture.isPending || contrat.statut !== "actif"}>{generateFacture.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}{t("genererFacture")}</Button>
          </div>
          {/* Pas d'endpoint backend pour lister les factures récurrentes → état vide (cf. FINDING ci-dessus).
              La génération de facture reste fonctionnelle (bouton ci-dessus). */}
          <Card><CardContent className="py-12 text-center"><Receipt className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">{t("aucuneFacture")}</p></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
