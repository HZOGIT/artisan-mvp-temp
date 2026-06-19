import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Plus, Trash2, Receipt, User, CheckCircle, Download, Mail, Search, Loader2, Lock, FileText, History, AlertTriangle, Bell, Circle, AlarmClock } from "lucide-react";
import { generateFacturePDF } from "@/shared/lib/pdfGenerator";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { Textarea } from "@/shared/ui/textarea";
import { useFactureDetail, searchArticlesRest } from "../application/use-facture-detail";
import { formatCurrency, isAvoirDoc, avoirSolde, avoirLignesMontantTTC, buildAvoirTotalLignes, pdfLignes, activitesForFacture, pendingCount, allowedNext, statutAction, STATUS_LABEL_KEY, STATUS_COLORS, RAPPEL_TYPE_KEY, type ArticleSearchResult, type AvoirLigneForm, type RappelType } from "../domain/facture-detail";

/*
 * Page `/factures/:id` — migration clean-archi de `pages/FactureDetail.tsx` (le plus gros éditeur). Markup
 * à l'identique. Logique de solde d'avoir en domain (testée) ; le `handleSelectArticle` legacy était dead code.
 */
export default function FactureDetailPage() {
  const { t } = useTranslation("factureDetail");
  const { id: idParam } = useParams({ strict: false }) as { id?: string };
  const factureId = parseInt(idParam || "0");
  const F = useFactureDetail(factureId);
  const { facture, isLoading, artisan, parametres, activites, refetchActivites, avoirs, auditLogs, inv } = F;

  const [isAddLineDialogOpen, setIsAddLineDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isAvoirDialogOpen, setIsAvoirDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [avoirType, setAvoirType] = useState<"total" | "partiel">("total");
  const [avoirNotes, setAvoirNotes] = useState("");
  const [avoirLignes, setAvoirLignes] = useState<AvoirLigneForm[]>([]);
  const [paymentData, setPaymentData] = useState({ montantPaye: "", datePaiement: format(new Date(), "yyyy-MM-dd") });
  const [lineForm, setLineForm] = useState({ reference: "", designation: "", description: "", quantite: "1", unite: "unité", prixUnitaireHT: "", tauxTVA: "20.00" });
  const [searchResults, setSearchResults] = useState<ArticleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [rappelTitre, setRappelTitre] = useState("");
  const [rappelEcheance, setRappelEcheance] = useState("");
  const [rappelType, setRappelType] = useState<RappelType>("relance");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchArticles = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setSearchResults([]); setIsSearching(false); setShowDropdown(false); return; }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => { const data = await searchArticlesRest(query); setSearchResults(data); setShowDropdown(data.length > 0); setIsSearching(false); }, 300);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const goList = () => { window.location.href = "/factures"; };
  const resetLineForm = () => setLineForm({ reference: "", designation: "", description: "", quantite: "1", unite: "unité", prixUnitaireHT: "", tauxTVA: "20.00" });

  const handleStatusChange = (newStatus: string) => {
    const onOk = () => { inv(); toast.success(t("toastStatut")); };
    const onErr = (e: { message: string }) => toast.error(e.message);
    const action = statutAction(newStatus);
    if (action === "envoyer") F.envoyer.mutate({ id: factureId }, { onSuccess: onOk, onError: onErr });
    else if (action === "marquerEnRetard") F.marquerEnRetard.mutate({ id: factureId }, { onSuccess: onOk, onError: onErr });
    else if (action === "payer") { setPaymentData((p) => ({ ...p, montantPaye: String(facture?.totalTTC || 0) })); setIsPaymentDialogOpen(true); }
  };

  const handleMarkAsPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentData.montantPaye) { toast.error(t("errMontantPaye")); return; }
    F.markAsPaid.mutate({ id: factureId, ...paymentData }, { onSuccess: () => { setIsPaymentDialogOpen(false); toast.success(t("toastPaiement")); } });
  };

  const handleAddLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineForm.designation || !lineForm.prixUnitaireHT) { toast.error(t("errChampsObligatoires")); return; }
    F.addLigne.mutate({ factureId, ...lineForm }, { onSuccess: () => { setIsAddLineDialogOpen(false); resetLineForm(); toast.success(t("toastLigneAjoutee")); }, onError: (e2) => toast.error(e2.message) });
  };

  const handleSendByEmail = () => {
    if (!facture?.client?.email) { toast.error(t("errPasEmail")); return; }
    F.sendByEmail.mutate({ factureId, customMessage: emailMessage || undefined, attachPdf }, {
      onSuccess: (result) => { if (result.success) { toast.success(result.message); inv(); setIsEmailDialogOpen(false); setEmailMessage(""); } else toast.error(result.message); },
      onError: (error) => toast.error(error.message || t("errEmailEnvoi")),
    });
  };

  const handleExportPDF = () => {
    if (!facture || !facture.client) { toast.error(t("errPdf")); return; }
    generateFacturePDF(artisan ?? {}, facture.client, {
      numero: facture.numero, dateCreation: facture.createdAt, dateEcheance: facture.dateEcheance, statut: facture.statut || "brouillon",
      objet: facture.objet, referenceClient: facture.referenceClient, lignes: pdfLignes(facture.lignes),
      totalHT: parseFloat(String(facture.totalHT)) || 0, totalTVA: parseFloat(String(facture.totalTVA)) || 0, totalTTC: parseFloat(String(facture.totalTTC)) || 0,
      montantPaye: parseFloat(String(facture.montantPaye)) || 0, conditions: facture.conditionsPaiement || null, isAvoir: isAvoirDoc(facture),
    }, { mentionsLegales: parametres?.mentionsLegales || null, cgv: parametres?.conditionsGenerales || null });
    toast.success(t("toastPdfOk"));
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!facture) return <div className="text-center py-12"><h2 className="text-xl font-semibold text-foreground">{t("factureNonTrouvee")}</h2><Button variant="link" onClick={goList}>{t("retourListe")}</Button></div>;

  const statut = facture.statut || "brouillon";
  const isLocked = statut !== "brouillon";
  const avoir = isAvoirDoc(facture);
  const factureTTC = parseFloat(String(facture.totalTTC)) || 0;
  const solde = avoirSolde(avoirs, factureTTC);
  const nouveauAvoirTTC = avoirLignesMontantTTC(avoirLignes);
  const depasseSolde = avoirType === "partiel" && nouveauAvoirTTC > solde.soldeRestant + 0.01;
  const allowedNextStatuses = allowedNext(statut);
  const dejaEnvoye = statut === "envoyee" || statut === "payee" || statut === "en_retard";
  const docArticle = avoir ? t("lAvoir") : t("laFacture");
  const rappels = activitesForFacture(activites, factureId);

  const handleCreateAvoir = () => {
    if (avoirType === "total") {
      F.createAvoir.mutate({ factureOrigineId: factureId, lignes: buildAvoirTotalLignes(facture.lignes), objet: t("objetAvoirTotal", { numero: facture.numero }), notes: avoirNotes || undefined }, { onSuccess: onAvoirOk, onError: (e) => toast.error(e.message) });
    } else {
      if (avoirLignes.length === 0) { toast.error(t("errAjoutLigneAvoir")); return; }
      F.createAvoir.mutate({ factureOrigineId: factureId, lignes: avoirLignes, objet: t("objetAvoirPartiel", { numero: facture.numero }), notes: avoirNotes || undefined }, { onSuccess: onAvoirOk, onError: (e) => toast.error(e.message) });
    }
  };
  function onAvoirOk(data: { id: number; numero: string }) { inv(); setIsAvoirDialogOpen(false); toast.success(t("toastAvoirCree", { numero: data.numero })); window.location.href = `/factures/${data.id}`; }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goList}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{facture.numero}</h1>
              {avoir && (<Badge className="bg-red-100 text-red-700 border-red-300">{t("avoirMaj")}</Badge>)}
              <Badge className={STATUS_COLORS[statut] || "bg-gray-100"}>{t(STATUS_LABEL_KEY[statut] ?? "statutBrouillon")}</Badge>
              {isLocked && (<Lock className="h-4 w-4 text-amber-500" />)}
            </div>
            <p className="text-muted-foreground">{facture.objet || (avoir ? t("avoir") : t("facture"))}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportPDF}><Download className="h-4 w-4 mr-2" />{t("exportPDF")}</Button>

          <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
            <DialogTrigger asChild><Button variant="outline" disabled={!facture.client?.email}><Mail className="h-4 w-4 mr-2" />{dejaEnvoye ? t("renvoyerEmail") : t("envoyerEmail")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{(dejaEnvoye ? t("renvoyerTitre", { doc: docArticle }) : t("envoyerTitre", { doc: docArticle }))}</DialogTitle>
                <DialogDescription>{t("envoyeA", { doc: avoir ? "L'avoir" : "La facture", verbe: dejaEnvoye ? (avoir ? t("renvoye") : t("renvoyee")) : (avoir ? t("envoye") : t("envoyee")), email: facture.client?.email })}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>{t("messagePersonnalise")}</Label><Textarea placeholder={t("messagePlaceholder")} value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={4} /></div>
                <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm font-medium text-gray-700">{t("joindrePdf")}</span></label>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>{t("annuler")}</Button><Button onClick={handleSendByEmail} disabled={F.sendByEmail.isPending}>{F.sendByEmail.isPending ? (dejaEnvoye ? t("renvoiEnCours") : t("envoiEnCours")) : (dejaEnvoye ? t("renvoyer") : t("envoyer"))}</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          {allowedNextStatuses.length > 0 && (
            <Select value="" onValueChange={handleStatusChange}>
              <SelectTrigger className="w-44"><SelectValue placeholder={t("changerStatut")} /></SelectTrigger>
              <SelectContent>{allowedNextStatuses.map((s) => (<SelectItem key={s} value={s}>{t(STATUS_LABEL_KEY[s] ?? s)}</SelectItem>))}</SelectContent>
            </Select>
          )}

          {(statut === "envoyee" || statut === "en_retard") && (
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
              <DialogTrigger asChild><Button onClick={() => setPaymentData((p) => ({ ...p, montantPaye: String(facture.totalTTC || 0) }))}><CheckCircle className="h-4 w-4 mr-2" />{t("marquerPayee")}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("enregistrerPaiement")}</DialogTitle><DialogDescription>{t("saisirInfosPaiement")}</DialogDescription></DialogHeader>
                <form onSubmit={handleMarkAsPaid}>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label htmlFor="montantPaye">{t("montantPaye")}</Label><Input id="montantPaye" type="number" step="0.01" value={paymentData.montantPaye} onChange={(e) => setPaymentData({ ...paymentData, montantPaye: e.target.value })} required /></div>
                    <div className="space-y-2"><Label htmlFor="datePaiement">{t("datePaiement")}</Label><Input id="datePaiement" type="date" value={paymentData.datePaiement} onChange={(e) => setPaymentData({ ...paymentData, datePaiement: e.target.value })} required /></div>
                  </div>
                  <DialogFooter><Button type="button" variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>{t("annuler")}</Button><Button type="submit" disabled={F.markAsPaid.isPending}>{F.markAsPaid.isPending ? t("enregistrement") : t("enregistrer")}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {isLocked && !avoir && solde.bloque && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground border border-dashed border-gray-300 rounded-md px-3 py-2"><Lock className="h-4 w-4" />{solde.avoirTotalExistant ? t("avoirTotalDejaEmis", { numero: solde.avoirTotalExistant.numero }) : t("soldeCouvert")}</span>
          )}
          {isLocked && !avoir && !solde.bloque && (
            <Dialog open={isAvoirDialogOpen} onOpenChange={(open) => { setIsAvoirDialogOpen(open); if (open) { setAvoirType("total"); setAvoirNotes(""); setAvoirLignes([]); } }}>
              <DialogTrigger asChild><Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50"><FileText className="h-4 w-4 mr-2" />{t("emettreAvoir")}</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>{t("emettreAvoir")}</DialogTitle><DialogDescription>{t("creerAvoirSur", { numero: facture.numero, montant: formatCurrency(facture.totalTTC) })}</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  {solde.totalCouvert > 0 && (<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">{t("montantDejaCouvert", { couvert: formatCurrency(solde.totalCouvert), solde: formatCurrency(solde.soldeRestant) })}</div>)}
                  <div className="space-y-2">
                    <Label>{t("typeAvoir")}</Label>
                    <Select value={avoirType} onValueChange={(v) => setAvoirType(v as "total" | "partiel")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total" disabled={solde.totalCouvert > 0}>{t("avoirTotal")}{solde.totalCouvert > 0 && t("avoirTotalIndispo")}</SelectItem>
                        <SelectItem value="partiel">{t("avoirPartiel")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {avoirType === "total" && (<div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800"><AlertTriangle className="h-4 w-4 inline mr-1" />{t("avoirTotalRepartit", { montant: formatCurrency(-factureTTC) })}</div>)}
                  {avoirType === "partiel" && (
                    <div className="space-y-3">
                      <Label>{t("lignesAvoir")}</Label>
                      {avoirLignes.map((ligne, idx) => (
                        <div key={idx} className="grid grid-cols-5 gap-2 items-end">
                          <div className="col-span-2"><Input placeholder={t("designation")} value={ligne.designation} onChange={(e) => { const u = [...avoirLignes]; u[idx].designation = e.target.value; setAvoirLignes(u); }} /></div>
                          <Input type="number" step="0.01" placeholder={t("qte")} value={ligne.quantite} onChange={(e) => { const u = [...avoirLignes]; u[idx].quantite = e.target.value; setAvoirLignes(u); }} />
                          <Input type="number" step="0.01" placeholder={t("prixHT")} value={ligne.prixUnitaireHT} onChange={(e) => { const u = [...avoirLignes]; u[idx].prixUnitaireHT = e.target.value; setAvoirLignes(u); }} />
                          <Button variant="ghost" size="icon" onClick={() => setAvoirLignes(avoirLignes.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => setAvoirLignes([...avoirLignes, { designation: "", quantite: "1", prixUnitaireHT: "", tauxTVA: "20.00", unite: "unité" }])}><Plus className="h-4 w-4 mr-1" />{t("ajouterLigne")}</Button>
                    </div>
                  )}
                  {avoirType === "partiel" && avoirLignes.length > 0 && (
                    <div className={`rounded-lg p-3 text-sm border ${depasseSolde ? "bg-red-50 border-red-200 text-red-800" : "bg-gray-50 border-gray-200 text-gray-700"}`}>{t("montantCetAvoir", { montant: formatCurrency(nouveauAvoirTTC) })}{depasseSolde && (<div className="mt-1"><AlertTriangle className="h-4 w-4 inline mr-1" />{t("depasseSolde", { montant: formatCurrency(solde.soldeRestant) })}</div>)}</div>
                  )}
                  <div className="space-y-2"><Label>{t("notesOptionnel")}</Label><Textarea placeholder={t("motifAvoir")} value={avoirNotes} onChange={(e) => setAvoirNotes(e.target.value)} rows={2} /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setIsAvoirDialogOpen(false)}>{t("annuler")}</Button><Button onClick={handleCreateAvoir} disabled={F.createAvoir.isPending || depasseSolde} className="bg-red-600 hover:bg-red-700 text-white">{F.createAvoir.isPending ? t("creation") : t("creerAvoir")}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isLocked && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Lock className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div><p className="font-medium text-amber-800">{t("verrouTitre")}</p><p className="text-sm text-amber-600">{t("verrouDesc")}{!avoir && t("verrouAvoirHint")}</p></div>
        </div>
      )}

      {avoir && facture.factureOrigineId && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <FileText className="h-5 w-5 text-red-600 flex-shrink-0" />
          <div><p className="font-medium text-red-800">{t("avoirSurFactureOrigine")}</p><Button variant="link" className="p-0 h-auto text-red-700" onClick={() => { window.location.href = `/factures/${facture.factureOrigineId}`; }}>{t("voirFactureOrigine")}</Button></div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><User className="h-4 w-4" />{t("client")}</CardTitle></CardHeader><CardContent><p className="font-medium">{facture.client?.nom} {facture.client?.prenom}</p>{facture.client?.email && <p className="text-sm text-muted-foreground">{facture.client.email}</p>}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Receipt className="h-4 w-4" />{t("date")}</CardTitle></CardHeader><CardContent><p className="font-medium">{format(new Date(facture.createdAt), "dd MMMM yyyy", { locale: fr })}</p>{facture.dateEcheance && (<p className="text-sm text-muted-foreground">{t("echeance", { date: format(new Date(facture.dateEcheance), "dd/MM/yyyy", { locale: fr }) })}</p>)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t("totalTTC")}</CardTitle></CardHeader><CardContent><p className={`text-2xl font-bold ${avoir ? "text-red-600" : "text-primary"}`}>{formatCurrency(facture.totalTTC)}</p><p className="text-sm text-muted-foreground">{t("htLabel", { montant: formatCurrency(facture.totalHT) })}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("lignesDe", { doc: avoir ? t("deLAvoir") : t("deLaFacture") })}</CardTitle>
            {!isLocked && (
              <Dialog open={isAddLineDialogOpen} onOpenChange={setIsAddLineDialogOpen}>
                <DialogTrigger asChild><Button size="sm" onClick={resetLineForm}><Plus className="h-4 w-4 mr-2" />{t("ajouter")}</Button></DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>{t("ajouterLigne")}</DialogTitle><DialogDescription>{t("selectionnerArticleManuel")}</DialogDescription></DialogHeader>
                  <form onSubmit={handleAddLine}>
                    <div className="grid gap-4 py-4">
                      <div className="relative" ref={dropdownRef}>
                        <Label htmlFor="designation">{t("designationReq")}</Label>
                        <div className="relative mt-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input id="designation" value={lineForm.designation} onChange={(e) => { setLineForm({ ...lineForm, designation: e.target.value }); searchArticles(e.target.value); }} onFocus={() => { if (lineForm.designation.length >= 2) searchArticles(lineForm.designation); }} placeholder={t("rechercherOuSaisir")} className="pl-10" required />
                          {isSearching && (<Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />)}
                        </div>
                        {showDropdown && searchResults.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {searchResults.map((article) => (
                              <button key={article.id} type="button" onClick={() => { setLineForm({ ...lineForm, designation: article.nom, description: article.description || "", prixUnitaireHT: article.prix_base, unite: article.unite || "unité", tauxTVA: article.tauxTVA != null && article.tauxTVA !== "" ? String(parseFloat(article.tauxTVA)) : lineForm.tauxTVA }); setShowDropdown(false); toast.success(t("articleSelectionne", { nom: article.nom })); }} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b last:border-b-0 transition-colors">
                                <div className="font-medium text-sm">{article.nom}</div>
                                <div className="text-xs text-gray-500">{formatCurrency(article.prix_base)} / {article.unite}<span className="ml-2 text-gray-400">{article.categorie}</span></div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2"><Label htmlFor="reference">{t("reference")}</Label><Input id="reference" value={lineForm.reference} onChange={(e) => setLineForm({ ...lineForm, reference: e.target.value })} /></div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="space-y-2"><Label htmlFor="quantite">{t("quantite")}</Label><Input id="quantite" type="number" step="0.01" value={lineForm.quantite} onChange={(e) => setLineForm({ ...lineForm, quantite: e.target.value })} /></div>
                        <div className="space-y-2"><Label htmlFor="unite">{t("unite")}</Label><Input id="unite" value={lineForm.unite} onChange={(e) => setLineForm({ ...lineForm, unite: e.target.value })} /></div>
                        <div className="space-y-2"><Label htmlFor="prixUnitaireHT">{t("prixHTReq")}</Label><Input id="prixUnitaireHT" type="number" step="0.01" value={lineForm.prixUnitaireHT} onChange={(e) => setLineForm({ ...lineForm, prixUnitaireHT: e.target.value })} required /></div>
                        <div className="space-y-2"><Label htmlFor="tauxTVA">{t("tvaPct")}</Label><Input id="tauxTVA" type="number" step="0.01" value={lineForm.tauxTVA} onChange={(e) => setLineForm({ ...lineForm, tauxTVA: e.target.value })} /></div>
                      </div>
                    </div>
                    <DialogFooter><Button type="button" variant="outline" onClick={() => setIsAddLineDialogOpen(false)}>{t("annuler")}</Button><Button type="submit" disabled={F.addLigne.isPending}>{F.addLigne.isPending ? t("ajout") : t("ajouter")}</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {facture.lignes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>{t("colReference")}</th><th>{t("designation")}</th><th className="text-right">{t("qte")}</th><th className="text-right">{t("prixHT")}</th><th className="text-right">{t("colTVA")}</th><th className="text-right">{t("colTotalTTC")}</th></tr></thead>
                <tbody>
                  {facture.lignes.map((ligne) => {
                    if (ligne.type === "section" || ligne.type === "note") {
                      return (<tr key={ligne.id} className={ligne.type === "section" ? "bg-muted/50" : ""}><td colSpan={6} className={ligne.type === "section" ? "font-semibold" : "italic text-muted-foreground"}>{ligne.type === "section" ? "§ " : ""}{ligne.designation}</td></tr>);
                    }
                    return (
                      <tr key={ligne.id}>
                        <td>{ligne.reference || "-"}</td><td>{ligne.designation}</td><td className="text-right">{ligne.quantite} {ligne.unite}</td><td className="text-right">{formatCurrency(ligne.prixUnitaireHT)}</td><td className="text-right">{ligne.tauxTVA}%</td><td className="text-right font-medium">{formatCurrency(ligne.montantTTC)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2"><td colSpan={5} className="text-right font-medium">{t("totalHT")}</td><td className="text-right font-medium">{formatCurrency(facture.totalHT)}</td></tr>
                  <tr><td colSpan={5} className="text-right font-medium">{t("tva")}</td><td className="text-right font-medium">{formatCurrency(facture.totalTVA)}</td></tr>
                  <tr className="bg-muted/50"><td colSpan={5} className="text-right font-bold">{t("totalTTC")}</td><td className={`text-right font-bold ${avoir ? "text-red-600" : "text-primary"}`}>{formatCurrency(facture.totalTTC)}</td></tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground"><Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>{t("aucuneLigne")}</p>{!isLocked && (<Button variant="link" onClick={() => setIsAddLineDialogOpen(true)}>{t("ajouterLigne")}</Button>)}</div>
          )}
        </CardContent>
      </Card>

      {!avoir && avoirs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-red-500" />{t("avoirsEmis")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {avoirs.map((av) => (
                <div key={av.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg cursor-pointer hover:bg-red-100 transition-colors" onClick={() => { window.location.href = `/factures/${av.id}`; }}>
                  <div className="flex items-center gap-3"><Badge className="bg-red-100 text-red-700">{t("avoirMaj")}</Badge><span className="font-medium">{av.numero}</span><span className="text-sm text-muted-foreground">{av.dateFacture ? format(new Date(av.dateFacture), "dd/MM/yyyy") : ""}</span></div>
                  <span className="font-medium text-red-600">{formatCurrency(av.totalTTC)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {auditLogs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />{t("journalAudit")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"><span className="text-muted-foreground whitespace-nowrap">{log.createdAt ? format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: fr }) : ""}</span><span className="text-foreground">{log.details || log.action}</span></div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />{t("rappels", { n: pendingCount(rappels) })}</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col sm:flex-row gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); if (!rappelTitre.trim()) { toast.error(t("errTitreRequis")); return; } if (!rappelEcheance) { toast.error(t("errEcheanceRequise")); return; } F.createRappel.mutate({ titre: rappelTitre.trim(), echeance: rappelEcheance, type: rappelType, entiteType: "facture", entiteId: factureId }, { onSuccess: () => { toast.success(t("toastRappelAjoute")); setRappelTitre(""); setRappelEcheance(""); setRappelType("relance"); refetchActivites(); }, onError: (e2) => toast.error(e2.message) }); }}>
            <Input placeholder={t("relancerPlaceholder", { numero: facture.numero })} value={rappelTitre} onChange={(e) => setRappelTitre(e.target.value)} className="flex-1" />
            <Input type="date" value={rappelEcheance} onChange={(e) => setRappelEcheance(e.target.value)} className="sm:w-40" />
            <Select value={rappelType} onValueChange={(v) => setRappelType(v as RappelType)}>
              <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="relance">{t("rappelRelance")}</SelectItem><SelectItem value="appel">{t("rappelAppel")}</SelectItem><SelectItem value="email">{t("rappelEmail")}</SelectItem><SelectItem value="rdv">{t("rappelRdv")}</SelectItem><SelectItem value="autre">{t("rappelAutre")}</SelectItem></SelectContent>
            </Select>
            <Button type="submit" disabled={F.createRappel.isPending}><Plus className="h-4 w-4 mr-1" /> {t("ajouter")}</Button>
          </form>
          {rappels.length > 0 ? (
            <div className="space-y-2">
              {rappels.map((a) => (
                <div key={a.id} className="flex items-start gap-2 p-3 rounded-lg border">
                  <button type="button" title={a.fait ? t("marquerAFaire") : t("marquerFait")} onClick={() => F.toggleRappel.mutate({ id: a.id, fait: !a.fait }, { onSuccess: () => refetchActivites() })} className="mt-0.5 shrink-0">{a.fait ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}</button>
                  <div className="flex-1 min-w-0"><p className={`text-sm font-medium ${a.fait ? "line-through text-muted-foreground" : ""}`}>{a.titre}</p><div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><AlarmClock className="h-3 w-3" />{format(new Date(a.echeance), "dd MMM yyyy", { locale: fr })}</span><span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-semibold">{t(RAPPEL_TYPE_KEY[a.type] ?? "rappelAutre")}</span></div></div>
                  <button type="button" title={t("supprimer")} onClick={() => F.deleteRappel.mutate({ id: a.id }, { onSuccess: () => refetchActivites() })} className="mt-0.5 shrink-0 text-muted-foreground hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          ) : (<p className="text-center py-6 text-sm text-muted-foreground">{t("aucunRappel")}</p>)}
        </CardContent>
      </Card>
    </div>
  );
}
