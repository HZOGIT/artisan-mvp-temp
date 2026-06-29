import { useState, useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Save, Package, Check, Search, X, Sparkles, Plus } from "lucide-react";
import { matchSearch } from "@/shared/lib/normalize";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/ui/dialog";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { useDevisLigne } from "../application/use-devis-ligne";
import { defaultLigneForm, formatCurrency, articleDesignation, articlePrix, articleRef, filterArticles, groupByCategorie, lineTotals, formFromArticle, formFromSuggestion, buildAddLignePayload, type LigneForm, type LigneType } from "../domain/devis-ligne";
import { TVA_CATEGORIES } from "@/shared/tva/taux-tva-fr";
import type { TvaCategorieId } from "@/shared/tva/taux-tva-fr";

/*
 * Page `/devis/:id/ligne/nouvelle` — migration clean-archi de `pages/DevisLigneEdit.tsx`. Markup à
 * l'identique. Unification d'articles + totaux en domain (corrige les champs prix/réf snake_case legacy).
 */
export default function DevisLignePage() {
  const { t } = useTranslation("devisLigne");
  const { id: idParam } = useParams({ strict: false }) as { id?: string };
  const id = parseInt(idParam || "0");
  const [form, setForm] = useState<LigneForm>(defaultLigneForm);
  const [ligneType, setLigneType] = useState<LigneType>("produit");
  const isDisplayLine = ligneType === "section" || ligneType === "note";
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [iaEnabled, setIaEnabled] = useState(false);

  const { devis, devisLoading, articles, articlesLoading, suggestionsIA, iaLoading, createArticle, addLigne } = useDevisLigne(id, searchQuery, iaEnabled);

  const filtered = useMemo(() => filterArticles(articles, searchQuery, matchSearch), [articles, searchQuery]);
  const grouped = useMemo(() => groupByCategorie(filtered), [filtered]);
  const selectedArticle = articles.find((a) => a.id === parseInt(selectedArticleId));

  const goBack = () => { window.location.href = `/devis/${id}`; };

  const selectArticle = (articleId: string) => {
    const article = articles.find((a) => a.id === parseInt(articleId));
    if (!article) return;
    setSelectedArticleId(articleId);
    setForm(formFromArticle(article));
    setIsDialogOpen(false);
    toast.success(t("articleSelectionneToast", { nom: articleDesignation(article) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisplayLine && !form.designation) { toast.error(ligneType === "section" ? t("errSection") : t("errNote")); return; }
    if (!isDisplayLine && (!form.designation || !form.prixUnitaireHT)) { toast.error(t("errDesignationPrix")); return; }
    addLigne.mutate(buildAddLignePayload(id, form, ligneType), {
      onSuccess: () => { toast.success(t("toastLigneAjoutee")); goBack(); },
      onError: (error) => toast.error(t("errAjout", { msg: error.message })),
    });
  };

  const totals = lineTotals(form);

  if (devisLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  if (!devis) {
    return <div className="text-center py-8"><p className="text-muted-foreground">{t("devisNonTrouve")}</p><Button variant="link" onClick={() => { window.location.href = "/devis"; }}>{t("retourDevis")}</Button></div>;
  }
  if (devis.statut !== "brouillon") {
    return <div className="text-center py-8"><p className="text-muted-foreground">{t("devisNonModifiable")}</p><Button variant="link" onClick={goBack}>{t("retourDevis")}</Button></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">{t("ajouterLigne")}</h1>
          <p className="text-muted-foreground">{t("devisSousTitre", { numero: devis.numero, objet: devis.objet })}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("typeLigne")}</CardTitle>
            <CardDescription>{t("typeLigneDesc1")}<strong>{t("section")}</strong>{t("typeLigneDesc2")}<strong>{t("note")}</strong>{t("typeLigneDesc3")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={ligneType} onValueChange={(v) => setLigneType(v as LigneType)}>
              <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="produit">{t("typeProduit")}</SelectItem>
                <SelectItem value="section">{t("typeSection")}</SelectItem>
                <SelectItem value="note">{t("typeNote")}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {!isDisplayLine && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{t("selectionnerArticle")}</CardTitle>
                <CardDescription>{t("selectionnerArticleDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" variant="outline" className="w-full justify-between h-auto min-h-[44px] py-2" onClick={() => setIsDialogOpen(true)}>
                  {selectedArticle ? (
                    <div className="flex flex-col items-start text-left"><span className="font-medium">{articleDesignation(selectedArticle)}</span><span className="text-xs text-muted-foreground">{articleRef(selectedArticle)} - {formatCurrency(articlePrix(selectedArticle))}</span></div>
                  ) : (<span className="text-muted-foreground flex items-center"><Search className="h-4 w-4 mr-2" />{t("rechercherArticle")}</span>)}
                </Button>
                {selectedArticle && (<div className="mt-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg"><p className="text-sm text-green-700 dark:text-green-300">{t("articleSelectionne")}<strong>{articleDesignation(selectedArticle)}</strong>{t("champsPreRemplis")}</p></div>)}
              </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{t("selectionnerArticle")}</DialogTitle>
                  <DialogDescription>{t("rechercherParNomRefCat")}</DialogDescription>
                </DialogHeader>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder={t("rechercherArticle")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" autoFocus />
                  {searchQuery && (<Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7" onClick={() => setSearchQuery("")}><X className="h-4 w-4" /></Button>)}
                </div>
                <ScrollArea className="h-[400px] pr-4">
                  {articlesLoading ? (
                    <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                  ) : filtered.length === 0 && !iaEnabled ? (
                    <div className="text-center py-8 text-muted-foreground space-y-3">
                      <div>{searchQuery ? t("aucunArticlePour", { q: searchQuery }) : t("aucunArticle")}</div>
                      {searchQuery.length >= 3 && (<Button type="button" variant="outline" size="sm" onClick={() => setIaEnabled(true)} className="border-violet-300 text-violet-700 hover:bg-violet-50"><Sparkles className="h-4 w-4 mr-2" />{t("demanderIA")}</Button>)}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(grouped).map(([categorie, list]) => (
                        <div key={categorie}>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2 sticky top-0 bg-background py-1">{categorie} ({list.length})</h4>
                          <div className="space-y-1">
                            {list.map((article) => (
                              <button key={article.id} type="button" className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedArticleId === String(article.id) ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"}`} onClick={() => selectArticle(String(article.id))}>
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">{selectedArticleId === String(article.id) && (<Check className="h-4 w-4 text-primary" />)}<span className="font-medium">{articleDesignation(article)}</span></div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1"><span>{articleRef(article)}</span>{article.unite && <span>• {article.unite}</span>}</div>
                                  </div>
                                  <span className="text-sm font-semibold text-primary">{formatCurrency(articlePrix(article))}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {iaEnabled && searchQuery.length >= 3 && (
                    <div className="mt-4 pt-4 border-t-2 border-violet-200">
                      <h4 className="text-sm font-semibold text-violet-700 mb-2 flex items-center gap-1"><Sparkles className="h-4 w-4" /> {t("suggestionsIA")}</h4>
                      {iaLoading ? (<div className="text-xs text-muted-foreground py-2">{t("rechercheIA")}</div>) : suggestionsIA.length === 0 ? (<div className="text-xs text-muted-foreground py-2">{t("aucuneSuggestionIA")}</div>) : (
                        <div className="space-y-1">
                          {suggestionsIA.map((sug, idx) => (
                            <div key={idx} className="p-3 rounded-lg border border-violet-200 bg-violet-50/40">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm">{sug.designation}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">{sug.reference} {sug.unite && `• ${sug.unite}`}{sug.description && <> — {sug.description}</>}</div>
                                  <div className="text-xs font-semibold text-violet-700 mt-0.5">{formatCurrency(sug.prixUnitaire)}</div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                  <Button type="button" size="sm" variant="default" onClick={() => { setForm(formFromSuggestion(sug)); setIsDialogOpen(false); toast.success(t("suggestionAppliquee")); }}>{t("utiliser")}</Button>
                                  <Button type="button" size="sm" variant="outline" onClick={() => createArticle.mutate({ reference: sug.reference || `IA-${Date.now()}`, designation: sug.designation || "", description: sug.description, unite: sug.unite || "unité", prixUnitaireHT: String(sug.prixUnitaire ?? "0"), categorie: sug.categorie }, { onSuccess: () => toast.success(t("toastArticleAjoute")) })}><Plus className="h-3 w-3 mr-1" /> {t("bibliotheque")}</Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!iaEnabled && filtered.length > 0 && searchQuery.length >= 3 && (
                    <div className="mt-3 text-center"><Button type="button" variant="ghost" size="sm" onClick={() => setIaEnabled(true)} className="text-violet-700 hover:bg-violet-50 text-xs"><Sparkles className="h-3 w-3 mr-1" />{t("demanderAutresIA")}</Button></div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </>
        )}

        <Card>
          <CardHeader><CardTitle>{isDisplayLine ? (ligneType === "section" ? t("titreSection") : t("texteNote")) : t("detailsLigne")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!isDisplayLine && (<div className="space-y-2"><Label htmlFor="reference">{t("reference")}</Label><Input id="reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="REF-001" /></div>)}
              <div className={`space-y-2 ${isDisplayLine ? "sm:col-span-2" : ""}`}>
                <Label htmlFor="designation">{isDisplayLine ? (ligneType === "section" ? t("titreSectionReq") : t("texteNoteReq")) : t("designationReq")}</Label>
                <Input id="designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder={isDisplayLine ? (ligneType === "section" ? t("placeholderSection") : t("placeholderNote")) : t("placeholderDesignation")} required />
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="description">{t("description")}</Label><Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("descriptionPlaceholder")} rows={3} /></div>
            {!isDisplayLine && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="space-y-2"><Label htmlFor="quantite">{t("quantite")}</Label><Input id="quantite" type="number" step="0.01" min="0" value={form.quantite} onChange={(e) => setForm({ ...form, quantite: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label htmlFor="unite">{t("unite")}</Label>
                  <Select value={form.unite} onValueChange={(value) => setForm({ ...form, unite: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unité">{t("unite")}</SelectItem>
                      <SelectItem value="heure">{t("uHeure")}</SelectItem>
                      <SelectItem value="jour">{t("uJour")}</SelectItem>
                      <SelectItem value="m²">{t("uM2")}</SelectItem>
                      <SelectItem value="ml">{t("uMl")}</SelectItem>
                      <SelectItem value="kg">{t("uKg")}</SelectItem>
                      <SelectItem value="forfait">{t("uForfait")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label htmlFor="prixUnitaireHT">{t("prixUnitaireHT")}</Label><Input id="prixUnitaireHT" type="number" step="0.01" min="0" value={form.prixUnitaireHT} onChange={(e) => setForm({ ...form, prixUnitaireHT: e.target.value })} placeholder="0.00" required /></div>
                <div className="space-y-2"><Label htmlFor="remise">{t("remise")}</Label><Input id="remise" type="number" step="1" min="0" max="100" value={form.remise} onChange={(e) => setForm({ ...form, remise: e.target.value })} placeholder="0" /></div>
                <div className="space-y-2">
                  <Label htmlFor="tvaCategorieId">{t("tauxTVA")}</Label>
                  <Select value={form.tvaCategorieId} onValueChange={(value) => setForm({ ...form, tvaCategorieId: value as TvaCategorieId })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TVA_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {!isDisplayLine && (
          <Card>
            <CardHeader><CardTitle>{t("recapitulatif")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-muted rounded-lg"><p className="text-sm text-muted-foreground">{t("totalHT")}</p><p className="text-xl font-bold">{formatCurrency(totals.totalHT)}</p></div>
                <div className="p-4 bg-muted rounded-lg"><p className="text-sm text-muted-foreground">{t("tvaLabel", { taux: totals.tauxTVA })}</p><p className="text-xl font-bold">{formatCurrency(totals.totalTVA)}</p></div>
                <div className="p-4 bg-primary/10 rounded-lg"><p className="text-sm text-muted-foreground">{t("totalTTC")}</p><p className="text-xl font-bold text-primary">{formatCurrency(totals.totalTTC)}</p></div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={goBack}>{t("annuler")}</Button>
          <Button type="submit" disabled={addLigne.isPending}><Save className="h-4 w-4 mr-2" />{addLigne.isPending ? t("ajoutEnCours") : t("ajouterLaLigne")}</Button>
        </div>
      </form>
    </div>
  );
}
