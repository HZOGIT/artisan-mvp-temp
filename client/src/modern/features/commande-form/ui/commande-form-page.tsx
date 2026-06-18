import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Search, Loader2, Send, Save, Sparkles, ChevronDown } from "lucide-react";
import { matchSearch } from "@/modern/shared/lib/normalize";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { useCommandeForm, searchBiblioRest } from "../application/use-commande-form";
import { defaultCommandeForm, emptyLigne, formatCurrency, totals, mapArtisanArticles, mapBiblioResults, ligneFromSearchResult, mapIaLignes, ligneFromCommande, validateForm, buildCreatePayload, buildUpdatePayload, type LigneCommande, type SearchResult, type CommandeForm } from "../domain/commande-form";

// Page `/v2/commandes/nouvelle` + `/v2/commandes/:id/modifier` — migration clean-archi de
// `pages/CommandeFournisseurForm.tsx`. ⚠️ En édition, le backend ne met à jour QUE les métadonnées (cf. domain).
export default function CommandeFormPage() {
  const { t } = useTranslation("commandeForm");
  const { id: idParam } = useParams({ strict: false }) as { id?: string };
  const commandeId = idParam ? parseInt(idParam) : 0;
  const isEdit = commandeId > 0;

  const [form, setForm] = useState<CommandeForm>(defaultCommandeForm);
  const [lignes, setLignes] = useState<LigneCommande[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchLigneId, setActiveSearchLigneId] = useState<string | null>(null);
  const [iaSectionOpen, setIaSectionOpen] = useState(false);
  const [selectedDevisId, setSelectedDevisId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const C = useCommandeForm(commandeId, iaSectionOpen);
  const { fournisseurs, artisanArticles, devisAcceptes, devisAcceptesList, commande, lignesExistantes, utils } = C;

  // Chargement de la commande existante (édition).
  useEffect(() => {
    if (isEdit && commande) {
      setForm({
        fournisseurId: commande.fournisseurId,
        dateLivraisonPrevue: commande.dateLivraisonPrevue ? new Date(commande.dateLivraisonPrevue).toISOString().split("T")[0] : "",
        adresseLivraison: commande.adresseLivraison || "", notes: commande.notes || "",
      });
    }
  }, [isEdit, commande]);
  useEffect(() => { if (isEdit && lignesExistantes.length > 0) setLignes(lignesExistantes.map(ligneFromCommande)); }, [isEdit, lignesExistantes]);

  const searchArticles = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const local = mapArtisanArticles(artisanArticles, query, matchSearch);
      const biblio = mapBiblioResults(await searchBiblioRest(query));
      setSearchResults([...local, ...biblio]);
      setIsSearching(false);
    }, 300);
  }, [artisanArticles]);

  const goList = () => { window.location.href = "/commandes"; };
  const setLigne = (id: string, patch: Partial<LigneCommande>) => setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addArticleLine = () => { const l = emptyLigne(); setLignes((ls) => [...ls, l]); setActiveSearchLigneId(l.id); };
  const selectArticle = (ligneId: string, article: SearchResult) => {
    setLignes((ls) => ls.map((l) => (l.id === ligneId ? ligneFromSearchResult(l, article) : l)));
    setActiveSearchLigneId(null); setSearchResults([]);
  };

  const handleSubmit = async (sendEmail: boolean) => {
    const err = validateForm(form.fournisseurId, lignes);
    if (err) { toast.error(t(err)); return; }
    setIsSubmitting(true);
    try {
      let resultId: number;
      if (isEdit) { await C.update.mutateAsync(buildUpdatePayload(commandeId, form)); resultId = commandeId; toast.success(t("toastCommandeMaj")); }
      else { const result = await C.create.mutateAsync(buildCreatePayload(form, lignes)); resultId = result.id; toast.success(t("toastCommandeCree")); }
      if (sendEmail) {
        try { await C.sendEmail.mutateAsync({ id: resultId }); toast.success(t("toastEmailEnvoye")); }
        catch (e) { toast.error(e instanceof Error ? e.message : t("errEmailEnvoi")); }
      }
      utils.commandesFournisseurs.list.invalidate();
      window.location.href = "/commandes";
    } catch (error) { toast.error(error instanceof Error ? error.message : t("errSauvegarde")); } finally { setIsSubmitting(false); }
  };

  const tot = useMemo(() => totals(lignes), [lignes]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goList}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? t("modifierCommande", { numero: commande?.numero ? ` ${commande.numero}` : "" }) : t("nouvelleCommande")}</h1>
          <p className="text-muted-foreground">{isEdit ? t("modifierDetails") : t("creerBon")}</p>
        </div>
      </div>

      {isEdit && (<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{t("editLimite")}</div>)}

      <Card>
        <CardHeader><CardTitle>{t("informations")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fournisseur">{t("fournisseur")}</Label>
              <Select value={form.fournisseurId ? form.fournisseurId.toString() : ""} onValueChange={(v) => setForm({ ...form, fournisseurId: parseInt(v) })} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder={t("selectionnerFournisseur")} /></SelectTrigger>
                <SelectContent>{fournisseurs.map((f) => (<SelectItem key={f.id} value={f.id.toString()}>{f.nom}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label htmlFor="dateLivraison">{t("dateLivraison")}</Label><Input id="dateLivraison" type="date" value={form.dateLivraisonPrevue} onChange={(e) => setForm({ ...form, dateLivraisonPrevue: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="adresseLivraison">{t("adresseLivraison")}</Label><Input id="adresseLivraison" placeholder={t("adresseLivraisonPlaceholder")} value={form.adresseLivraison} onChange={(e) => setForm({ ...form, adresseLivraison: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="notes">{t("notes")}</Label><Textarea id="notes" placeholder={t("notesPlaceholder")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
        </CardContent>
      </Card>

      {!isEdit && (
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50/60 to-white">
          <CardHeader className="cursor-pointer" onClick={() => setIaSectionOpen((v) => !v)}>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-violet-600" /><span>{t("genererDepuisDevis")}</span><span className="text-xs font-normal text-muted-foreground">{t("ia")}</span></CardTitle>
              <ChevronDown className={`h-4 w-4 transition-transform ${iaSectionOpen ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
          {iaSectionOpen && (
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("iaDesc")}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={selectedDevisId ? String(selectedDevisId) : ""} onValueChange={(v) => setSelectedDevisId(v ? Number(v) : null)}>
                  <SelectTrigger className="flex-1 bg-white"><SelectValue placeholder={devisAcceptes === undefined ? t("chargement") : devisAcceptesList.length === 0 ? t("aucunDevisAccepte") : t("selectionnerDevisAccepte")} /></SelectTrigger>
                  <SelectContent>{devisAcceptesList.map((d) => (<SelectItem key={d.id} value={String(d.id)}>{d.numero} — {d.clientNom} ({formatCurrency(d.totalTTC)})</SelectItem>))}</SelectContent>
                </Select>
                <Button onClick={() => selectedDevisId && C.genererIA.mutate({ devisId: selectedDevisId }, { onSuccess: (data) => { if (data.lignes.length === 0) { toast.info(t("iaAucuneLigne")); return; } setLignes((prev) => [...prev, ...mapIaLignes(data)]); if (data.notes && !form.notes) setForm((f) => ({ ...f, notes: data.notes })); toast.success(t("iaLignesGenerees", { n: data.lignes.length, numero: data.devisNumero })); setIaSectionOpen(false); setSelectedDevisId(null); }, onError: (e) => toast.error(e.message || t("errGenerationIA")) })} disabled={!selectedDevisId || C.genererIA.isPending} className="bg-violet-600 hover:bg-violet-700">
                  {C.genererIA.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("generation")}</>) : (<><Sparkles className="h-4 w-4 mr-2" /> {t("genererLignes")}</>)}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("lignesAjoutees")}</p>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("lignesCommande")}</CardTitle>
          {!isEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addArticleLine}><Search className="h-4 w-4 mr-1" />{t("articleBibliotheque")}</Button>
              <Button variant="outline" size="sm" onClick={() => setLignes((ls) => [...ls, emptyLigne()])}><Plus className="h-4 w-4 mr-1" />{t("ligneManuelle")}</Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><p>{t("aucuneLigne")}</p></div>
          ) : (
            <div className="space-y-3">
              <div className="hidden md:grid grid-cols-[1fr_80px_80px_100px_70px_100px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>{t("colDesignation")}</span><span className="text-center">{t("colQte")}</span><span className="text-center">{t("colUnite")}</span><span className="text-right">{t("colPuHt")}</span><span className="text-center">{t("colTva")}</span><span className="text-right">{t("colTotalHt")}</span><span></span>
              </div>
              {lignes.map((ligne) => (
                <div key={ligne.id} className="relative">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_80px_80px_100px_70px_100px_40px] gap-2 items-start p-2 rounded-lg border bg-card">
                    <div className="relative">
                      <Input placeholder={t("designationPlaceholder")} value={ligne.designation} disabled={isEdit}
                        onChange={(e) => { setLigne(ligne.id, { designation: e.target.value }); if (activeSearchLigneId === ligne.id) searchArticles(e.target.value); }}
                        onFocus={() => { if (activeSearchLigneId === ligne.id && ligne.designation.length >= 2) searchArticles(ligne.designation); }} />
                      {activeSearchLigneId === ligne.id && (searchResults.length > 0 || isSearching) && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {isSearching && (<div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {t("recherche")}</div>)}
                          {searchResults.map((article) => (
                            <button key={article.id} type="button" onClick={() => selectArticle(ligne.id, article)} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b last:border-b-0 transition-colors">
                              <div className="font-medium text-sm">{article.nom}</div>
                              <div className="text-xs text-muted-foreground">{article.prixAchat ? t("achat", { montant: formatCurrency(article.prixAchat) }) : t("pasPrixAchat")}{article.reference && <span className="ml-2">{t("ref", { ref: article.reference })}</span>}<span className="ml-2 text-gray-400">{article.type === "artisan" ? t("stock") : t("bibliotheque")}</span></div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Input type="number" min="0" step="0.01" placeholder={t("qte")} value={ligne.quantite} disabled={isEdit} onChange={(e) => setLigne(ligne.id, { quantite: parseFloat(e.target.value) || 0 })} className="text-center" />
                    <Input placeholder={t("unite")} value={ligne.unite} disabled={isEdit} onChange={(e) => setLigne(ligne.id, { unite: e.target.value })} className="text-center" />
                    <Input type="number" min="0" step="0.01" placeholder={t("prixHT")} value={ligne.prixUnitaire ?? ""} disabled={isEdit} onChange={(e) => setLigne(ligne.id, { prixUnitaire: e.target.value ? parseFloat(e.target.value) : undefined })} className="text-right" />
                    <Input type="number" min="0" max="100" step="0.1" value={ligne.tauxTVA} disabled={isEdit} onChange={(e) => setLigne(ligne.id, { tauxTVA: parseFloat(e.target.value) || 0 })} className="text-center" />
                    <div className="flex items-center justify-end text-sm font-medium h-9 px-2">{formatCurrency(ligne.quantite * (ligne.prixUnitaire || 0))}</div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" disabled={isEdit} onClick={() => setLignes((ls) => ls.filter((l) => l.id !== ligne.id))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {lignes.length > 0 && (
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("totalHT")}</span><span className="font-medium">{formatCurrency(tot.totalHT)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("tva")}</span><span className="font-medium">{formatCurrency(tot.totalTVA)}</span></div>
                <div className="flex justify-between border-t pt-2 text-base"><span className="font-bold">{t("totalTTC")}</span><span className="font-bold text-green-600">{formatCurrency(tot.totalTTC)}</span></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={goList} disabled={isSubmitting}>{t("annuler")}</Button>
        <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}{t("enregistrerBrouillon")}</Button>
        <Button onClick={() => handleSubmit(true)} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}{t("enregistrerEnvoyer")}</Button>
      </div>
    </div>
  );
}
