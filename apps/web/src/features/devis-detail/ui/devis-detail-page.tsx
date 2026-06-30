import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Plus, Trash2, FileText, User, Receipt, Download, Mail, Copy, Pen, Layers, Star, Check, ArrowRight, Bell, Circle, AlarmClock, TrendingUp, Paperclip, X } from "lucide-react";
import { generateDevisPDF } from "@/shared/lib/pdf-generator";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Textarea } from "@/shared/ui/textarea";
import { useDevisDetail } from "../application/use-devis-detail";
import { formatCurrency, activitesForDevis, pendingCount, pdfLignes, statutTransition, nextStatuts, STATUS_LABEL_KEY, STATUS_COLORS, RAPPEL_TYPE_KEY, sectionSousTotaux, type RappelType } from "../domain/devis-detail";

/*
 * Page `/devis/:id` — migration clean-archi de `pages/DevisDetail.tsx`. Markup à l'identique. Le dialog
 * d'ajout de ligne legacy était DEAD CODE (jamais déclenché — le bouton navigue vers la page ligne) → omis.
 */
export default function DevisDetailPage() {
  const { t } = useTranslation("devisDetail");
  const { id: idParam } = useParams({ strict: false }) as { id?: string };
  const id = parseInt(idParam || "0");
  const D = useDevisDetail(id);
  const { devis, isLoading, artisan, parametres, activites, refetchActivites, signature, variantes, refetchVariantes, pieces, refetchPieces, inv } = D;

  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [emailPieceIds, setEmailPieceIds] = useState<number[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false);
  const [isNewVarianteOpen, setIsNewVarianteOpen] = useState(false);
  const [newVarianteForm, setNewVarianteForm] = useState({ nom: "", description: "", recommandee: false });
  const [isSituationOpen, setIsSituationOpen] = useState(false);
  const [situationPct, setSituationPct] = useState("");
  const [isAcompteOpen, setIsAcompteOpen] = useState(false);
  const [acompteMontant, setAcompteMontant] = useState("");
  const [rappelTitre, setRappelTitre] = useState("");
  const [rappelEcheance, setRappelEcheance] = useState("");
  const [rappelType, setRappelType] = useState<RappelType>("relance");

  const goList = () => { window.location.href = "/devis"; };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === devis?.statut) return;
    const onOk = () => { inv(); toast.success(t("toastStatut")); };
    const onErr = (e: { message: string }) => toast.error(e.message);
    const which = statutTransition(newStatus);
    if (which === "envoyer") D.envoyer.mutate({ id }, { onSuccess: onOk, onError: onErr });
    else if (which === "accepter") D.accepter.mutate({ id }, { onSuccess: onOk, onError: onErr });
    else if (which === "refuser") D.refuser.mutate({ id }, { onSuccess: onOk, onError: onErr });
    else if (which === "expirer") D.expirer.mutate({ id }, { onSuccess: onOk, onError: onErr });
  };

  const handleExportPDF = () => {
    if (!devis || !devis.client) { toast.error(t("errPdf")); return; }
    generateDevisPDF(artisan ?? {}, devis.client, {
      numero: devis.numero, dateCreation: devis.createdAt, dateValidite: devis.dateValidite, statut: devis.statut || "brouillon",
      objet: devis.objet, referenceClient: devis.referenceClient, lignes: pdfLignes(devis.lignes),
      totalHT: parseFloat(String(devis.totalHT)) || 0, totalTVA: parseFloat(String(devis.totalTVA)) || 0, totalTTC: parseFloat(String(devis.totalTTC)) || 0,
      conditions: devis.conditionsPaiement || null,
    }, { mentionsLegales: parametres?.mentionsLegales || null, cgv: parametres?.conditionsGenerales || null, mediateurConsommation: parametres?.mediateurConsommation || null });
    toast.success(t("toastPdfOk"));
  };

  const handleSendByEmail = () => {
    if (!devis?.client?.email) { toast.error(t("errPasEmail")); return; }
    D.sendByEmail.mutate({ devisId: id, customMessage: emailMessage || undefined, attachPdf, pieceJointeIds: emailPieceIds.length ? emailPieceIds : undefined }, {
      onSuccess: (result) => { if (result.success) { toast.success(result.message); inv(); setIsEmailDialogOpen(false); setEmailMessage(""); setEmailPieceIds([]); } else toast.error(result.message); },
      onError: (error) => toast.error(error.message || t("errEmailEnvoi")),
    });
  };

  const handleUploadPiece = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("devisId", String(id));
    setIsUploading(true);
    try {
      const res = await fetch("/api/pieces-jointes", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error((err as { message?: string }).message ?? "Erreur upload"); return; }
      toast.success("Pièce jointe ajoutée");
      void refetchPieces();
    } catch { toast.error("Erreur réseau"); } finally { setIsUploading(false); }
  };

  const handleDeleteLine = (lineId: number) => { if (confirm(t("confirmSupprimerLigne"))) D.deleteLigne.mutate({ id: lineId, devisId: id }, { onSuccess: () => toast.success(t("toastLigneSupprimee")) }); };
  const handleConvert = () => { if (confirm(t("confirmConvertirFacture"))) D.convertToFacture.mutate({ devisId: id }, { onSuccess: (data) => { toast.success(t("toastFactureCree")); window.location.href = `/factures/${data.id}`; }, onError: (err) => toast.error(err.message || t("errFacture")) }); };
  const handleDuplicate = () => { if (confirm(t("confirmDupliquer"))) D.duplicate.mutate({ devisId: id }, { onSuccess: (nd) => { toast.success(t("toastDuplique")); window.location.href = `/devis/${nd.id}`; }, onError: () => toast.error(t("errDuplication")) }); };

  const handleFacturerAcompte = () => {
    const montant = acompteMontant.replace(",", ".");
    if (!montant || isNaN(parseFloat(montant)) || parseFloat(montant) <= 0) { toast.error(t("errMontantAcompteInvalide")); return; }
    D.facturerAcompte.mutate({ devisId: id, montant }, {
      onSuccess: (f) => { toast.success(t("toastAcompteCree")); setIsAcompteOpen(false); setAcompteMontant(""); window.location.href = `/factures/${f.id}`; },
      onError: (e) => toast.error(e.message || t("errAcompte")),
    });
  };

  const handleFacturerSolde = () => {
    if (!confirm(t("confirmSolde"))) return;
    D.facturerSolde.mutate({ devisId: id }, {
      onSuccess: (f) => { toast.success(t("toastSoldeCree")); window.location.href = `/factures/${f.id}`; },
      onError: (e) => toast.error(e.message || t("errSolde")),
    });
  };

  const handleFacturerSituation = () => {
    const pct = parseFloat(situationPct);
    if (!pct || pct <= 0 || pct > 100) { toast.error(t("errPourcentageInvalide")); return; }
    D.facturerSituation.mutate({ devisId: id, pourcentageCumule: pct }, {
      onSuccess: (f) => { toast.success(t("toastSituationCreee")); setIsSituationOpen(false); setSituationPct(""); window.location.href = `/factures/${f.id}`; },
      onError: (e) => toast.error(e.message || t("errSituation")),
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!devis) return <div className="text-center py-12"><h2 className="text-xl font-semibold text-foreground">{t("devisNonTrouve")}</h2><Button variant="link" onClick={goList}>{t("retourListe")}</Button></div>;

  const statut = devis.statut || "brouillon";
  const rappels = activitesForDevis(activites, id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goList}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{devis.numero}</h1>
              <Badge className={STATUS_COLORS[statut] || "bg-gray-100"}>{t(STATUS_LABEL_KEY[statut] ?? "statutBrouillon")}</Badge>
            </div>
            <p className="text-muted-foreground">{devis.objet || t("devisDefaut")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(() => {
            const suivants = nextStatuts(statut);
            return (
              <Select value={statut} onValueChange={handleStatusChange} disabled={suivants.length === 0}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={statut} disabled>{t(STATUS_LABEL_KEY[statut] ?? "statutBrouillon")}</SelectItem>
                  {suivants.map((s) => (
                    <SelectItem key={s} value={s}>{t(STATUS_LABEL_KEY[s] ?? s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
          <Button variant="outline" onClick={handleExportPDF}><Download className="h-4 w-4 mr-2" />{t("exportPDF")}</Button>
          <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
            <DialogTrigger asChild><Button variant="outline" disabled={!devis.client?.email}><Mail className="h-4 w-4 mr-2" />{t("envoyerEmail")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("envoyerEmailTitre")}</DialogTitle><DialogDescription>{t("envoyeA", { email: devis.client?.email })}</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>{t("messagePersonnalise")}</Label><Textarea placeholder={t("messagePlaceholder")} value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={4} /></div>
                <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">{t("joindrePdf")}</span></label>
                {pieces.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">{t("piecesJointesEmail")}</p>
                    <div className="space-y-1.5">
                      {pieces.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={emailPieceIds.includes(p.id)} onChange={(e) => setEmailPieceIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm text-gray-700 truncate">{p.filename}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>{t("annuler")}</Button><Button onClick={handleSendByEmail} disabled={D.sendByEmail.isPending}>{D.sendByEmail.isPending ? t("envoiEnCours") : t("envoyer")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleDuplicate} disabled={D.duplicate.isPending}><Copy className="h-4 w-4 mr-2" />{t("dupliquer")}</Button>
          {(statut === "brouillon" || statut === "envoye") && devis.client?.email && !signature && (
            <Dialog open={isSignatureDialogOpen} onOpenChange={setIsSignatureDialogOpen}>
              <DialogTrigger asChild><Button variant="outline"><Pen className="h-4 w-4 mr-2" />{t("envoyerAuClient")}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("envoyerSignatureTitre")}</DialogTitle><DialogDescription>{t("envoyerSignatureDesc", { email: devis.client?.email })}</DialogDescription></DialogHeader>
                <div className="py-4"><p className="text-sm text-muted-foreground">{t("lienValide30j")}</p></div>
                <DialogFooter><Button variant="outline" onClick={() => setIsSignatureDialogOpen(false)}>{t("annuler")}</Button><Button onClick={() => D.requestSignature.mutate({ devisId: id }, { onSuccess: () => { toast.success(t("toastSignatureLien")); setIsSignatureDialogOpen(false); inv(); }, onError: (err) => toast.error(err.message || t("errSignatureLien")) })} disabled={D.requestSignature.isPending}>{D.requestSignature.isPending ? t("envoiEnCours") : t("envoyerAuClient")}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {(statut === "accepte" || statut === "envoye") && (<Button onClick={handleConvert} disabled={D.convertToFacture.isPending}><Receipt className="h-4 w-4 mr-2" />{t("convertirFacture")}</Button>)}
          {statut === "accepte" && (
            <Dialog open={isSituationOpen} onOpenChange={setIsSituationOpen}>
              <DialogTrigger asChild><Button variant="outline"><TrendingUp className="h-4 w-4 mr-2" />{t("facturerSituation")}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("facturerSituationTitre")}</DialogTitle>
                  <DialogDescription>{t("facturerSituationDesc", { total: formatCurrency(devis.totalTTC), dejaFacture: formatCurrency(devis.montantDejaFacture) })}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="situation-pct">{t("pourcentageCumule")}</Label>
                    <div className="flex items-center gap-2">
                      <Input id="situation-pct" type="number" min="1" max="100" step="1" placeholder="30" value={situationPct} onChange={(e) => setSituationPct(e.target.value)} className="w-32" />
                      <span className="text-muted-foreground">%</span>
                    </div>
                    {situationPct && parseFloat(situationPct) > 0 && parseFloat(situationPct) <= 100 && (
                      <p className="text-sm text-muted-foreground">{t("montantSituationEstime", { montant: formatCurrency(String(Math.max(0, Math.round((parseFloat(situationPct) / 100 * parseFloat(String(devis.totalTTC)) - parseFloat(String(devis.montantDejaFacture))) * 100) / 100))) })}</p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsSituationOpen(false); setSituationPct(""); }}>{t("annuler")}</Button>
                  <Button onClick={handleFacturerSituation} disabled={D.facturerSituation.isPending}>{D.facturerSituation.isPending ? t("creation") : t("creerSituation")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {statut === "accepte" && (
            <Dialog open={isAcompteOpen} onOpenChange={setIsAcompteOpen}>
              <DialogTrigger asChild><Button variant="outline"><Receipt className="h-4 w-4 mr-2" />{t("facturerAcompte")}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("facturerAcompteTitre")}</DialogTitle>
                  <DialogDescription>{t("facturerAcompteDesc", { total: formatCurrency(devis.totalTTC), dejaFacture: formatCurrency(devis.montantDejaFacture) })}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="acompte-montant">{t("montantAcompteTTC")}</Label>
                    <div className="flex items-center gap-2">
                      <Input id="acompte-montant" type="number" min="0.01" step="0.01" placeholder="1000.00" value={acompteMontant} onChange={(e) => setAcompteMontant(e.target.value)} className="w-40" />
                      <span className="text-muted-foreground">{t("unitEuroTTC")}</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsAcompteOpen(false); setAcompteMontant(""); }}>{t("annuler")}</Button>
                  <Button onClick={handleFacturerAcompte} disabled={D.facturerAcompte.isPending}>{D.facturerAcompte.isPending ? t("creation") : t("creerAcompte")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {statut === "accepte" && (
            <Button variant="outline" onClick={handleFacturerSolde} disabled={D.facturerSolde.isPending}>
              <FileText className="h-4 w-4 mr-2" />{t("facturerSolde")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><User className="h-4 w-4" />{t("client")}</CardTitle></CardHeader>
          <CardContent><p className="font-medium">{devis.client?.nom} {devis.client?.prenom}</p>{devis.client?.email && <p className="text-sm text-muted-foreground">{devis.client.email}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />{t("date")}</CardTitle></CardHeader>
          <CardContent><p className="font-medium">{format(new Date(devis.createdAt), "dd MMMM yyyy", { locale: fr })}</p>{devis.dateValidite && (<p className="text-sm text-muted-foreground">{t("valideJusqu", { date: format(new Date(devis.dateValidite), "dd/MM/yyyy", { locale: fr }) })}</p>)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t("totalTTC")}</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-primary">{formatCurrency(devis.totalTTC)}</p><p className="text-sm text-muted-foreground">{t("htLabel", { montant: formatCurrency(devis.totalHT) })}</p></CardContent>
        </Card>
      </div>

      {signature && (
        <Card className={signature.statut === "accepte" ? "border-green-300 bg-green-50" : signature.statut === "refuse" ? "border-red-300 bg-red-50" : "border-blue-300 bg-blue-50"}>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Pen className="h-5 w-5" />
                <div>
                  <p className="font-medium">
                    {signature.statut === "accepte" && t("devisAccepteSigne", { nom: signature.signataireName })}
                    {signature.statut === "refuse" && (signature.motifRefus ? t("devisRefuseMotif", { motif: signature.motifRefus }) : t("devisRefuse"))}
                    {signature.statut === "en_attente" && t("signatureEnAttente")}
                  </p>
                  {signature.signedAt && (<p className="text-sm text-muted-foreground">{t("leDate", { date: format(new Date(signature.signedAt), "dd/MM/yyyy 'à' HH:mm", { locale: fr }) })}</p>)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/devis-public/${signature.token}`); toast.success(t("lienCopie")); }}><Copy className="h-4 w-4 mr-1" />{t("copierLien")}</Button>
                {signature.statut === "accepte" && signature.signatureData && (
                  <Dialog>
                    <DialogTrigger asChild><Button variant="outline" size="sm"><Pen className="h-4 w-4 mr-1" />{t("voirSignature")}</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{t("signatureDe", { nom: signature.signataireName })}</DialogTitle></DialogHeader>
                      <div className="border rounded-lg p-4 bg-white"><img src={signature.signatureData} alt="Signature" className="w-full" /></div>
                      <p className="text-sm text-muted-foreground">{t("ipSigne", { ip: signature.ipAddress, date: signature.signedAt ? format(new Date(signature.signedAt), "dd/MM/yyyy HH:mm", { locale: fr }) : "" })}</p>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="lignes" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="lignes" className="min-h-[44px] sm:min-h-0"><FileText className="h-4 w-4 mr-2" />{t("ongletLignes", { n: devis.lignes.length })}</TabsTrigger>
          <TabsTrigger value="variantes" className="min-h-[44px] sm:min-h-0"><Layers className="h-4 w-4 mr-2" />{t("ongletVariantes", { n: variantes.length })}</TabsTrigger>
          <TabsTrigger value="pieces" className="min-h-[44px] sm:min-h-0"><Paperclip className="h-4 w-4 mr-2" />{t("ongletPieces")}{pieces.length > 0 && <span className="ml-1 text-xs opacity-70">({pieces.length})</span>}</TabsTrigger>
        </TabsList>

        <TabsContent value="lignes" className="mt-4">
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>{t("lignesDevis")}</CardTitle>{statut === "brouillon" && <Button size="sm" onClick={() => { window.location.href = `/devis/${id}/ligne/nouvelle`; }}><Plus className="h-4 w-4 mr-2" />{t("ajouterLigne")}</Button>}</div></CardHeader>
            <CardContent>
              {devis.lignes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead><tr><th>{t("colReference")}</th><th>{t("colDesignation")}</th><th className="text-right">{t("colQte")}</th><th className="text-right">{t("colPrixHT")}</th><th className="text-right">{t("colTVA")}</th><th className="text-right">{t("colTotalTTC")}</th><th className="w-12"></th></tr></thead>
                    <tbody>
                      {(() => { const stMap = sectionSousTotaux(devis.lignes); return devis.lignes.map((ligne, i) => {
                        const st = stMap.get(i);
                        if (ligne.type === "section" || ligne.type === "note") {
                          return (
                            <tr key={ligne.id} className={ligne.type === "section" ? "bg-muted/50" : ""}>
                              <td colSpan={6} className={ligne.type === "section" ? "font-semibold" : "italic text-muted-foreground"}>{ligne.type === "section" ? "§ " : ""}{ligne.designation}</td>
                              <td>{statut === "brouillon" && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteLine(ligne.id)}><Trash2 className="h-4 w-4" /></Button>}</td>
                            </tr>
                          );
                        }
                        return (
                          <>
                            <tr key={ligne.id}>
                              <td>{ligne.reference || "-"}</td>
                              <td>{ligne.designation}</td>
                              <td className="text-right">{ligne.quantite} {ligne.unite}</td>
                              <td className="text-right">{formatCurrency(ligne.prixUnitaireHT)}</td>
                              <td className="text-right">{ligne.tauxTVA}%</td>
                              <td className="text-right font-medium">{formatCurrency(ligne.montantTTC)}</td>
                              <td>{statut === "brouillon" && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteLine(ligne.id)}><Trash2 className="h-4 w-4" /></Button>}</td>
                            </tr>
                            {st && (
                              <tr key={`st-${i}`} className="bg-slate-100/80 border-t border-slate-200">
                                <td colSpan={6} className="text-right text-sm font-semibold text-slate-600 py-1 pr-4">{t("sousTotalLot", { label: st.sectionLabel, montant: formatCurrency(st.totalHT) })}</td>
                                <td></td>
                              </tr>
                            )}
                          </>
                        );
                      }); })()}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2"><td colSpan={5} className="text-right font-medium">{t("totalHT")}</td><td className="text-right font-medium">{formatCurrency(devis.totalHT)}</td><td></td></tr>
                      <tr><td colSpan={5} className="text-right font-medium">{t("tva")}</td><td className="text-right font-medium">{formatCurrency(devis.totalTVA)}</td><td></td></tr>
                      <tr className="bg-muted/50"><td colSpan={5} className="text-right font-bold">{t("totalTTC")}</td><td className="text-right font-bold text-primary">{formatCurrency(devis.totalTTC)}</td><td></td></tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>{t("aucuneLigne")}</p>{statut === "brouillon" && <Button variant="link" onClick={() => { window.location.href = `/devis/${id}/ligne/nouvelle`; }}>{t("ajouterLigne")}</Button>}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variantes" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div><CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-blue-600" />{t("variantesDevis")}</CardTitle><p className="text-sm text-muted-foreground mt-1">{t("variantesDesc")}</p></div>
                <Button onClick={() => setIsNewVarianteOpen(true)} className="min-h-[44px] sm:min-h-0"><Plus className="h-4 w-4 mr-2" />{t("ajouterVariante")}</Button>
              </div>
            </CardHeader>
            <CardContent>
              {variantes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><Layers className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>{t("aucuneVariante")}</p><p className="text-xs mt-1">{t("aucuneVarianteHint")}</p></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {variantes.map((v) => (
                    <Card key={v.id} className={v.selectionnee ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/10" : v.recommandee ? "border-amber-300" : ""}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{v.nom}</CardTitle>
                          <div className="flex gap-1 flex-shrink-0">
                            {v.recommandee && (<Badge className="bg-amber-100 text-amber-800 border border-amber-300"><Star className="h-3 w-3 mr-0.5" /> {t("reco")}</Badge>)}
                            {v.selectionnee && (<Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300"><Check className="h-3 w-3 mr-0.5" /> {t("choisie")}</Badge>)}
                          </div>
                        </div>
                        {v.description && (<p className="text-xs text-muted-foreground line-clamp-2 mt-1">{v.description}</p>)}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-2xl font-bold text-primary">{formatCurrency(v.totalTTC)}</div>
                        <div className="text-xs text-muted-foreground">{t("htTva", { ht: formatCurrency(v.totalHT), tva: formatCurrency(v.totalTVA) })}</div>
                        <div className="flex flex-wrap gap-1 pt-2">
                          {!v.selectionnee && (<Button variant="outline" size="sm" onClick={() => D.selectVariante.mutate({ optionId: v.id }, { onSuccess: () => { refetchVariantes(); toast.success(t("toastVarianteSelectionnee")); } })} disabled={D.selectVariante.isPending}><Check className="h-3 w-3 mr-1" /> {t("selectionner")}</Button>)}
                          <Button variant="outline" size="sm" onClick={() => { if (confirm(t("confirmConvertirVariante", { nom: v.nom }))) D.convertirVariante.mutate({ optionId: v.id }, { onSuccess: () => { inv(); refetchVariantes(); toast.success(t("toastVarianteConvertie")); }, onError: (e) => toast.error(e.message || t("errConversion")) }); }} disabled={D.convertirVariante.isPending}><ArrowRight className="h-3 w-3 mr-1" /> {t("convertir")}</Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm(t("confirmSupprimerVariante", { nom: v.nom }))) D.deleteVariante.mutate({ id: v.id }, { onSuccess: () => { refetchVariantes(); toast.success(t("toastVarianteSupprimee")); } }); }}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={isNewVarianteOpen} onOpenChange={setIsNewVarianteOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("nouvelleVariante")}</DialogTitle><DialogDescription>{t("nouvelleVarianteDesc")}</DialogDescription></DialogHeader>
              <div className="space-y-3 py-2">
                <div><Label htmlFor="variante-nom">{t("nom")}</Label><Input id="variante-nom" value={newVarianteForm.nom} onChange={(e) => setNewVarianteForm({ ...newVarianteForm, nom: e.target.value })} placeholder={t("nomVariantePlaceholder")} /></div>
                <div><Label htmlFor="variante-description">{t("descriptionOptionnel")}</Label><Textarea id="variante-description" rows={2} value={newVarianteForm.description} onChange={(e) => setNewVarianteForm({ ...newVarianteForm, description: e.target.value })} placeholder={t("descriptionVariantePlaceholder")} /></div>
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={newVarianteForm.recommandee} onChange={(e) => setNewVarianteForm({ ...newVarianteForm, recommandee: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />{t("marquerRecommandee")}</label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewVarianteOpen(false)}>{t("annuler")}</Button>
                <Button onClick={() => { if (!newVarianteForm.nom.trim()) { toast.error(t("errNomObligatoire")); return; } D.createVariante.mutate({ devisId: id, nom: newVarianteForm.nom, description: newVarianteForm.description || undefined, recommandee: newVarianteForm.recommandee }, { onSuccess: () => { refetchVariantes(); setIsNewVarianteOpen(false); setNewVarianteForm({ nom: "", description: "", recommandee: false }); toast.success(t("toastVarianteCree")); }, onError: (e) => toast.error(e.message || t("errVariante")) }); }} disabled={D.createVariante.isPending}>{D.createVariante.isPending ? t("creation") : t("creerVariante")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="pieces" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Paperclip className="h-5 w-5" />{t("piecesJointes")}</CardTitle>
                <label className="cursor-pointer">
                  <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={isUploading || pieces.length >= 10} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadPiece(f); e.target.value = ""; }} />
                  <Button size="sm" variant="outline" asChild disabled={isUploading || pieces.length >= 10}><span><Plus className="h-4 w-4 mr-2" />{isUploading ? t("envoi") : t("ajouterPiece")}</span></Button>
                </label>
              </div>
            </CardHeader>
            <CardContent>
              {pieces.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><Paperclip className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">{t("aucunePiece")}</p></div>
              ) : (
                <div className="space-y-2">
                  {pieces.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm truncate">{p.filename}</span>
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline shrink-0"><Download className="h-3.5 w-3.5" /></a>
                      <button type="button" title={t("supprimer")} onClick={() => { if (confirm(t("supprimerPiece"))) D.deletePiece.mutate({ id: p.id }); }} className="text-muted-foreground hover:text-rose-500 shrink-0"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />{t("rappels", { n: pendingCount(rappels) })}</CardTitle></CardHeader>
        <CardContent>
          {devis.statut !== "accepte" && devis.statut !== "refuse" && (
            <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); if (!rappelTitre.trim()) { toast.error(t("errTitreRequis")); return; } if (!rappelEcheance) { toast.error(t("errEcheanceRequise")); return; } D.createRappel.mutate({ titre: rappelTitre.trim(), echeance: rappelEcheance, type: rappelType, entiteType: "devis", entiteId: id }, { onSuccess: () => { toast.success(t("toastRappelAjoute")); setRappelTitre(""); setRappelEcheance(""); setRappelType("relance"); refetchActivites(); }, onError: (e) => toast.error(e.message) }); }}>
              <Input placeholder={t("relancerPlaceholder", { numero: devis.numero })} value={rappelTitre} onChange={(e) => setRappelTitre(e.target.value)} className="flex-1" />
              <Input type="date" value={rappelEcheance} onChange={(e) => setRappelEcheance(e.target.value)} className="sm:w-40" />
              <Select value={rappelType} onValueChange={(v) => setRappelType(v as RappelType)}>
                <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="relance">{t("rappelRelance")}</SelectItem>
                  <SelectItem value="appel">{t("rappelAppel")}</SelectItem>
                  <SelectItem value="email">{t("rappelEmail")}</SelectItem>
                  <SelectItem value="rdv">{t("rappelRdv")}</SelectItem>
                  <SelectItem value="autre">{t("rappelAutre")}</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={D.createRappel.isPending}><Plus className="h-4 w-4 mr-1" /> {t("ajouter")}</Button>
            </form>
          )}
          {rappels.length > 0 ? (
            <div className="space-y-2">
              {rappels.map((a) => (
                <div key={a.id} className="flex items-start gap-2 p-3 rounded-lg border">
                  <button type="button" title={a.fait ? t("marquerAFaire") : t("marquerFait")} onClick={() => D.toggleRappel.mutate({ id: a.id, fait: !a.fait }, { onSuccess: () => refetchActivites() })} className="mt-0.5 shrink-0">{a.fait ? <Check className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}</button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${a.fait ? "line-through text-muted-foreground" : ""}`}>{a.titre}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><AlarmClock className="h-3 w-3" />{format(new Date(a.echeance), "dd MMM yyyy", { locale: fr })}</span><span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">{t(RAPPEL_TYPE_KEY[a.type] ?? "rappelAutre")}</span></div>
                  </div>
                  <button type="button" title={t("supprimer")} onClick={() => D.deleteRappel.mutate({ id: a.id }, { onSuccess: () => refetchActivites() })} className="mt-0.5 shrink-0 text-muted-foreground hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          ) : (<p className="text-center py-6 text-sm text-muted-foreground">{t("aucunRappel")}</p>)}
        </CardContent>
      </Card>
    </div>
  );
}
