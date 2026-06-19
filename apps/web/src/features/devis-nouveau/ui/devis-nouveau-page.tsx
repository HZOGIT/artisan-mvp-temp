import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Search, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useDevisNouveau, useModeleLoader, searchArticlesRest } from "../application/use-devis-nouveau";
import { emptyLigne, formatCurrency, totals, moveLine, ligneFromArticle, iaToLignes, iaTotals, buildCreatePayload, buildAddLignePayload, buildModeleLignePayload, type LigneDevis, type ArticleSearchResult, type IAProposition } from "../domain/devis-nouveau";

/*
 * Page `/devis/nouveau` — migration clean-archi de `pages/DevisNouveauPage.tsx`. Markup à l'identique.
 * Calculs/mappings en domain (testés) ; recherche article REST + génération IA encapsulées en application.
 */
export default function DevisNouveauPage() {
  const { t } = useTranslation("devisNouveau");
  const [clientId, setClientId] = useState(0);
  const [dateDevis, setDateDevis] = useState(new Date().toISOString().split("T")[0]);
  const [dateExpiration, setDateExpiration] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
  const [objet, setObjet] = useState("");
  const [referenceClient, setReferenceClient] = useState("");
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ArticleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchLigneId, setActiveSearchLigneId] = useState<string | null>(null);
  const [selectedModeleId, setSelectedModeleId] = useState<number | null>(null);
  const [modeleNom, setModeleNom] = useState("");
  const [showSaveModele, setShowSaveModele] = useState(false);
  const [savingModele, setSavingModele] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { clients, encours, modeles, refetchModeles, utils, create, addLigne, createModele, addLigneToModele } = useDevisNouveau(clientId);
  const loadModele = useModeleLoader();

  const searchArticles = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => { setSearchResults(await searchArticlesRest(query)); setIsSearching(false); }, 300);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setActiveSearchLigneId(null); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const setLigne = <K extends keyof LigneDevis>(id: string, field: K, value: LigneDevis[K]) => setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  const selectArticle = (ligneId: string, article: ArticleSearchResult) => {
    setLignes((ls) => ls.map((l) => (l.id === ligneId ? ligneFromArticle(l, article) : l)));
    setActiveSearchLigneId(null); setSearchQuery(""); setSearchResults([]);
    toast.success(t("articleSelectionne", { nom: article.nom }));
  };

  const handleSaveAsModele = async () => {
    if (!modeleNom.trim()) { toast.error(t("errNomModele")); return; }
    if (lignes.length === 0) { toast.error(t("errLigneModele")); return; }
    setSavingModele(true);
    try {
      const modele = await createModele.mutateAsync({ nom: modeleNom.trim() });
      for (const l of lignes) await addLigneToModele.mutateAsync(buildModeleLignePayload(modele.id, l));
      toast.success(t("toastModeleOk")); setModeleNom(""); setShowSaveModele(false); refetchModeles();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("errModele")); } finally { setSavingModele(false); }
  };

  const handleLoadModele = async (modeleId: number) => {
    try {
      const data = await loadModele(modeleId);
      if (data?.lignes) {
        setLignes((ls) => [...ls, ...data.lignes.map((l) => ({ ...emptyLigne(), description: l.designation, quantite: parseFloat(String(l.quantite)), prixUnitaireHT: parseFloat(String(l.prixUnitaireHT)), tauxTVA: parseFloat(String(l.tauxTVA)), unite: l.unite || "unité" }))]);
        setSelectedModeleId(null); toast.success(t("toastModeleCharge"));
      }
    } catch { toast.error(t("errModeleCharge")); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) { toast.error(t("errClient")); return; }
    if (lignes.length === 0) { toast.error(t("errLigne")); return; }
    setIsSubmitting(true);
    try {
      const devis = await create.mutateAsync(buildCreatePayload(clientId, objet, referenceClient, dateExpiration, notes));
      for (const ligne of lignes) await addLigne.mutateAsync(buildAddLignePayload(devis.id, ligne));
      toast.success(t("toastCree")); utils.devis.list.invalidate(); window.location.href = `/devis/${devis.id}`;
    } catch (error) { toast.error(error instanceof Error ? error.message : t("errCreation")); } finally { setIsSubmitting(false); }
  };

  const tot = useMemo(() => totals(lignes), [lignes]);
  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/devis"; }} className="gap-2"><ArrowLeft className="w-4 h-4" />{t("retour")}</Button>
        <div><h1 className="text-3xl font-bold">{t("nouveauDevis")}</h1><p className="text-gray-600">{t("creerNouveau")}</p></div>
      </div>

      <GenerationIASection onApply={(data) => { if (data.objet) setObjet(data.objet); if (data.lignes.length > 0) setLignes(iaToLignes(data)); }} />

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
        <div>
          <Label htmlFor="clientId" className="block text-sm font-medium mb-2">{t("client")}</Label>
          <select id="clientId" value={clientId.toString()} onChange={(e) => setClientId(parseInt(e.target.value))} required className={inputClass}>
            <option value="0">{t("selectionnerClient")}</option>
            {clients.map((client) => (<option key={client.id} value={client.id.toString()}>{client.nom} {client.prenom}</option>))}
          </select>
          {clientId > 0 && encours && parseFloat(encours.encoursTotal) > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span aria-hidden="true">⚠️</span>
              <span>{t("encoursAlerte", { montant: formatCurrency(encours.encoursTotal) })}{parseFloat(encours.echu) > 0 && t("dontEchus", { montant: formatCurrency(encours.echu) })}{t("surFactures", { n: encours.nbFacturesImpayees })}</span>
            </div>
          )}
        </div>

        <div><Label htmlFor="objet" className="block text-sm font-medium mb-2">{t("objetDevis")}</Label><Input id="objet" value={objet} onChange={(e) => setObjet(e.target.value)} placeholder={t("objetPlaceholder")} /></div>
        <div><Label htmlFor="referenceClient" className="block text-sm font-medium mb-2">{t("referenceClient")}</Label><Input id="referenceClient" value={referenceClient} onChange={(e) => setReferenceClient(e.target.value)} placeholder={t("referencePlaceholder")} /></div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label htmlFor="dateDevis" className="block text-sm font-medium mb-2">{t("dateDevis")}</Label><input id="dateDevis" type="date" value={dateDevis} onChange={(e) => setDateDevis(e.target.value)} className={inputClass} /></div>
          <div><Label htmlFor="dateExpiration" className="block text-sm font-medium mb-2">{t("dateExpiration")}</Label><input id="dateExpiration" type="date" value={dateExpiration} onChange={(e) => setDateExpiration(e.target.value)} className={inputClass} /></div>
        </div>

        {modeles.length > 0 && (
          <div>
            <Label className="block text-sm font-medium mb-2">{t("chargerModele")}</Label>
            <select value={selectedModeleId || ""} onChange={(e) => { const id = parseInt(e.target.value); if (id) { setSelectedModeleId(id); handleLoadModele(id); } }} className={inputClass}>
              <option value="">{t("selectionnerModele")}</option>
              {modeles.map((modele) => (<option key={modele.id} value={modele.id}>{modele.nom}</option>))}
            </select>
          </div>
        )}

        {lignes.length > 0 && (
          <div>
            {!showSaveModele ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSaveModele(true)}><Plus className="h-4 w-4 mr-1" /> {t("enregistrerModele")}</Button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <Input placeholder={t("nomModelePlaceholder")} value={modeleNom} onChange={(e) => setModeleNom(e.target.value)} className="sm:w-72" maxLength={255} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleSaveAsModele} disabled={savingModele}>{savingModele ? t("enregistrementEnCours") : t("enregistrer")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setShowSaveModele(false); setModeleNom(""); }}>{t("annuler")}</Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <Label className="block text-sm font-medium">{t("lignesDevis", { n: lignes.length })}</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setLignes([...lignes, emptyLigne()])} className="gap-2"><Plus className="w-4 h-4" />{t("ajouterLigne")}</Button>
          </div>

          {lignes.length > 0 ? (
            <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
              {lignes.map((ligne, index) => (
                <div key={ligne.id} className="bg-white p-4 rounded border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">{t("ligneN", { n: index + 1 })}</span>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLignes(moveLine(lignes, index, "up"))} disabled={index === 0} className="text-gray-600 disabled:opacity-50"><ChevronUp className="w-4 h-4" /></Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLignes(moveLine(lignes, index, "down"))} disabled={index === lignes.length - 1} className="text-gray-600 disabled:opacity-50"><ChevronDown className="w-4 h-4" /></Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLignes(lignes.filter((l) => l.id !== ligne.id))} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>

                  <div className="relative" ref={activeSearchLigneId === ligne.id ? dropdownRef : undefined}>
                    <Label className="text-xs font-medium mb-1 block">{t("designation")}</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        value={activeSearchLigneId === ligne.id ? searchQuery : ligne.description}
                        onChange={(e) => { const val = e.target.value; setActiveSearchLigneId(ligne.id); setSearchQuery(val); setLigne(ligne.id, "description", val); searchArticles(val); }}
                        onFocus={() => { setActiveSearchLigneId(ligne.id); setSearchQuery(ligne.description); if (ligne.description.length >= 2) searchArticles(ligne.description); }}
                        placeholder={t("rechercherOuSaisir")} className="pl-10"
                      />
                      {isSearching && activeSearchLigneId === ligne.id && (<Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />)}
                    </div>
                    {activeSearchLigneId === ligne.id && searchQuery.length >= 2 && searchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {searchResults.map((article) => (
                          <button key={article.id} type="button" onClick={() => selectArticle(ligne.id, article)} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b last:border-b-0 transition-colors">
                            <div className="font-medium text-sm">{article.nom}</div>
                            <div className="text-xs text-gray-500">{formatCurrency(article.prix_base)} / {article.unite}<span className="ml-2 text-gray-400">{article.categorie}</span></div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    <div><Label className="text-xs font-medium mb-1 block">{t("quantite")}</Label><Input type="number" value={ligne.quantite} onChange={(e) => setLigne(ligne.id, "quantite", parseFloat(e.target.value) || 0)} min="0.01" step="0.01" /></div>
                    <div><Label className="text-xs font-medium mb-1 block">{t("unite")}</Label><Input value={ligne.unite} onChange={(e) => setLigne(ligne.id, "unite", e.target.value)} placeholder="unité" /></div>
                    <div><Label className="text-xs font-medium mb-1 block">{t("prixHT")}</Label><Input type="number" value={ligne.prixUnitaireHT} onChange={(e) => setLigne(ligne.id, "prixUnitaireHT", parseFloat(e.target.value) || 0)} min="0" step="0.01" /></div>
                    <div><Label className="text-xs font-medium mb-1 block">{t("tvaPct")}</Label><Input type="number" value={ligne.tauxTVA} onChange={(e) => setLigne(ligne.id, "tauxTVA", parseFloat(e.target.value) || 20)} min="0" step="0.01" /></div>
                    <div><Label className="text-xs font-medium mb-1 block">{t("totalHTcol")}</Label><div className="px-3 py-2 bg-gray-100 rounded-md text-sm font-medium">{formatCurrency(ligne.quantite * ligne.prixUnitaireHT)}</div></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 text-center text-gray-500"><p>{t("aucuneLigne")}</p></div>
          )}
        </div>

        {lignes.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg space-y-2 border border-blue-200">
            <div className="flex justify-between"><span className="font-medium">{t("totalHT")}</span><span className="font-bold">{formatCurrency(tot.totalHT)}</span></div>
            <div className="flex justify-between"><span className="font-medium">{t("tva")}</span><span className="font-bold">{formatCurrency(tot.tva)}</span></div>
            <div className="flex justify-between border-t pt-2 text-lg"><span className="font-bold">{t("totalTTC")}</span><span className="font-bold text-blue-600">{formatCurrency(tot.totalTTC)}</span></div>
          </div>
        )}

        <div><Label htmlFor="notes" className="block text-sm font-medium mb-2">{t("notes")}</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder={t("notesPlaceholder")} /></div>

        <div className="flex justify-end gap-3 pt-6 border-t">
          <Button type="button" variant="outline" onClick={() => { window.location.href = "/devis"; }} disabled={isSubmitting}>{t("annuler")}</Button>
          <Button type="submit" disabled={isSubmitting || lignes.length === 0}>{isSubmitting ? t("creation") : t("creerDevis")}</Button>
        </div>
      </form>
    </div>
  );
}

/** Section « Générer avec l'IA » : description + surface + budget → genererLignesIA → aperçu + appliquer. */
function GenerationIASection({ onApply }: { onApply: (data: IAProposition) => void }) {
  const { t } = useTranslation("devisNouveau");
  const { genererIA } = useDevisNouveau(0);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [surface, setSurface] = useState("");
  const [budget, setBudget] = useState("");
  const [preview, setPreview] = useState<IAProposition | null>(null);

  const total = useMemo(() => (preview ? iaTotals(preview.lignes) : { ht: 0, ttc: 0 }), [preview]);

  const generer = () => {
    if (description.trim().length < 5) { toast.error(t("errDecrire")); return; }
    setPreview(null);
    genererIA.mutate({ description, surface: surface ? parseFloat(surface) : undefined, budget: budget ? parseFloat(budget) : undefined }, {
      onSuccess: (data) => { setPreview(data); toast.success(t("iaLignesGenerees", { n: data.lignes.length })); },
      onError: (e) => toast.error(e.message || t("errGenerationIA")),
    });
  };

  return (
    <div className="border-2 border-violet-300 rounded-lg overflow-hidden bg-gradient-to-br from-violet-50 to-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-violet-50/50 transition-colors">
        <span className="flex items-center gap-2 font-medium text-violet-900"><Sparkles className="h-5 w-5 text-violet-600" />{t("genererIA")}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div><Label className="text-xs">{t("decrivezTravaux")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t("travauxPlaceholder")} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">{t("surface")}</Label><Input type="number" step="0.1" value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="—" /></div>
            <div><Label className="text-xs">{t("budgetClient")}</Label><Input type="number" step="50" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="—" /></div>
          </div>
          <Button type="button" onClick={generer} disabled={genererIA.isPending} className="w-full min-h-[44px] bg-violet-600 hover:bg-violet-700">
            {genererIA.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("generationEnCours")}</>) : (<><Sparkles className="h-4 w-4 mr-2" /> {t("genererLignes")}</>)}
          </Button>

          {preview && preview.lignes.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-violet-200">
              {preview.dureeEstimee && (<p className="text-xs text-violet-700">{t("dureeEstimee", { duree: preview.dureeEstimee })}</p>)}
              {preview.objet && (<p className="text-xs text-violet-700">{t("objetIA")}<strong>{preview.objet}</strong></p>)}
              <div className="border rounded-lg overflow-hidden bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-violet-50 border-b"><tr><th className="text-left p-2">{t("colDesignation")}</th><th className="text-right p-2 whitespace-nowrap">{t("colQte")}</th><th className="p-2 whitespace-nowrap">{t("colUnite")}</th><th className="text-right p-2 whitespace-nowrap">{t("colPuHt")}</th></tr></thead>
                  <tbody>
                    {preview.lignes.map((l, i) => (
                      <tr key={i} className="border-b last:border-b-0"><td className="p-2 truncate max-w-[200px]">{l.designation}</td><td className="text-right p-2 whitespace-nowrap">{l.quantite}</td><td className="p-2 whitespace-nowrap">{l.unite}</td><td className="text-right p-2 whitespace-nowrap font-medium">{formatCurrency(l.prixUnitaire)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold"><span>{t("totalEstimeHT", { montant: formatCurrency(total.ht) })}</span><span className="text-violet-700">{t("ttcLabel", { montant: formatCurrency(total.ttc) })}</span></div>
              {preview.conseilsArtisan && (<div className="text-xs text-violet-800 bg-violet-50 p-2 rounded">{t("conseilIA")}{preview.conseilsArtisan}</div>)}
              {preview.notes && (<div className="text-xs text-muted-foreground p-2 rounded bg-slate-50">📝 {preview.notes}</div>)}
              <Button type="button" onClick={() => { onApply(preview); setOpen(false); setPreview(null); setDescription(""); setSurface(""); setBudget(""); toast.success(t("toastLignesIAappliquees")); }} className="w-full min-h-[44px]">{t("appliquerLignes")}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
