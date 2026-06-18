import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Camera, Upload, Sparkles, FileText, Trash2, Eye, CheckCircle2, Clock, AlertCircle, RefreshCw, ChevronRight, Edit2, Plus, Save, X } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Badge } from "@/modern/shared/ui/badge";
import { Checkbox } from "@/modern/shared/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modern/shared/ui/table";
import { useDevisIA } from "../application/use-devis-ia";
import { buildEditedMap, newSuggestion, lineTotal, calculateTotal, selectedCount, urgenceColor, statutVariant, buildUpdatePayload, TVA_RATE, type SuggestionEditable } from "../domain/devis-ia";

const STATUT_ICON: Record<string, typeof Clock> = { en_attente: Clock, en_cours: RefreshCw, termine: CheckCircle2, erreur: AlertCircle };

// Page `devis-ia` — migration clean-archi de `pages/DevisIA.tsx`. Markup à l'identique. État éditable des
// suggestions + agrégats (total HT/TTC) en domain (purs, testés) ; tRPC encapsulé dans `use-devis-ia`.
export default function DevisIAPage() {
  const { t } = useTranslation("devisIa");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAnalyse, setSelectedAnalyse] = useState<number | null>(null);
  const [formData, setFormData] = useState({ titre: "", description: "", clientId: 0 });
  const [editedSuggestions, setEditedSuggestions] = useState<Record<number, SuggestionEditable>>({});
  const [newSuggestions, setNewSuggestions] = useState<SuggestionEditable[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { analyses, clients, analyseDetails, isLoading, createAnalyse, addPhoto, analyser, updateSuggestion, genererDevis } = useDevisIA(selectedAnalyse);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedAnalyse) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = (event) => { addPhoto.mutate({ analyseId: selectedAnalyse, url: String(event.target?.result || ""), description: file.name }); };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateAnalyse = () => {
    if (!formData.titre) { toast.error(t("errTitre")); return; }
    createAnalyse.mutate(formData, { onSuccess: (data) => { toast.success(t("toastAnalyseCreee")); if (data) setSelectedAnalyse(data.id); setIsDialogOpen(false); }, onError: (e) => toast.error(e.message) });
  };

  const startEditMode = () => { setIsEditMode(true); setEditedSuggestions(buildEditedMap(analyseDetails?.resultats ?? [])); };
  const cancelEditMode = () => { setIsEditMode(false); setEditedSuggestions({}); setNewSuggestions([]); };
  const setEdited = <K extends keyof SuggestionEditable>(id: number, field: K, value: SuggestionEditable[K]) => setEditedSuggestions((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));
  const setNew = <K extends keyof SuggestionEditable>(id: number, field: K, value: SuggestionEditable[K]) => setNewSuggestions((p) => p.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  const addNewSuggestion = () => setNewSuggestions((p) => [...p, newSuggestion()]);
  const removeNewSuggestion = (id: number) => setNewSuggestions((p) => p.filter((s) => s.id !== id));

  const saveAllChanges = async () => {
    for (const s of Object.values(editedSuggestions)) await updateSuggestion.mutateAsync(buildUpdatePayload(s));
    toast.success(t("toastSauvegarde"));
    setIsEditMode(false);
  };

  const total = calculateTotal(editedSuggestions, newSuggestions);

  const StatutBadge = ({ statut: s }: { statut: string }) => {
    const Icon = STATUT_ICON[s] ?? Clock;
    return <Badge variant={statutVariant(s)} className="flex items-center gap-1"><Icon className={`h-3 w-3 ${s === "en_cours" ? "animate-spin" : ""}`} />{t(`statut.${s}`, s)}</Badge>;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button><Sparkles className="h-4 w-4 mr-2" />{t("nouvelleAnalyse")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("creerTitre")}</DialogTitle>
              <DialogDescription>{t("creerDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("titreAnalyse")}</Label>
                <Input value={formData.titre} onChange={(e) => setFormData({ ...formData, titre: e.target.value })} placeholder={t("titrePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t("descriptionPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("clientOptionnel")}</Label>
                <Select value={formData.clientId.toString()} onValueChange={(v) => setFormData({ ...formData, clientId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder={t("selClient")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("aucunClient")}</SelectItem>
                    {clients.map((client) => (<SelectItem key={client.id} value={client.id.toString()}>{client.nom}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("annuler")}</Button>
              <Button onClick={handleCreateAnalyse} disabled={createAnalyse.isPending}>{createAnalyse.isPending ? t("creation") : t("creerAnalyse")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des analyses */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold">{t("mesAnalyses")}</h2>
          {analyses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t("aucuneAnalyse")}</p>
                <Button variant="link" onClick={() => setIsDialogOpen(true)}>{t("creerPremiere")}</Button>
              </CardContent>
            </Card>
          ) : (
            analyses.map((analyse) => (
              <Card key={analyse.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedAnalyse === analyse.id ? "ring-2 ring-primary" : ""}`} onClick={() => setSelectedAnalyse(analyse.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{analyse.titre || t("sansTitre")}</CardTitle>
                      <CardDescription>{analyse.createdAt ? new Date(analyse.createdAt).toLocaleDateString() : "-"}</CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent><StatutBadge statut={analyse.statut || "en_attente"} /></CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Détails */}
        <div className="lg:col-span-2">
          {selectedAnalyse && analyseDetails ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{analyseDetails.titre || t("sansTitre")}</CardTitle>
                      <CardDescription>{analyseDetails.description}</CardDescription>
                    </div>
                    <StatutBadge statut={analyseDetails.statut || "en_attente"} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Photos */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">{t("photosChantier")}</h3>
                      <div className="flex gap-2">
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />{t("ajouterPhotos")}</Button>
                      </div>
                    </div>
                    {analyseDetails.photos && analyseDetails.photos.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {analyseDetails.photos.map((photo) => (
                          <div key={photo.id} className="relative group">
                            <img src={photo.url} alt={photo.description ?? ""} className="w-full h-32 object-cover rounded-lg" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                              <Button variant="ghost" size="icon" className="text-white"><Eye className="h-5 w-5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-lg p-8 text-center">
                        <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">{t("ajoutezPhotos")}</p>
                      </div>
                    )}
                  </div>

                  {/* Analyser */}
                  {analyseDetails.photos && analyseDetails.photos.length > 0 && analyseDetails.statut === "en_attente" && (
                    <Button className="w-full" onClick={() => analyser.mutate({ analyseId: selectedAnalyse }, { onSuccess: (data) => toast.success(t("toastAnalyseTerminee", { n: data.nombreTravaux })), onError: (e) => toast.error(e.message) })} disabled={analyser.isPending}>
                      {analyser.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t("analyseEnCours")}</> : <><Sparkles className="h-4 w-4 mr-2" />{t("analyserPhotos")}</>}
                    </Button>
                  )}

                  {/* Résultats */}
                  {analyseDetails.resultats && analyseDetails.resultats.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">{t("travauxDetectes")}</h3>
                        {!isEditMode && !analyseDetails.devisGenere && (
                          <Button variant="outline" size="sm" onClick={startEditMode}><Edit2 className="h-4 w-4 mr-2" />{t("modifierSuggestions")}</Button>
                        )}
                        {isEditMode && (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={cancelEditMode}><X className="h-4 w-4 mr-2" />{t("annuler")}</Button>
                            <Button size="sm" onClick={saveAllChanges}><Save className="h-4 w-4 mr-2" />{t("sauvegarder")}</Button>
                          </div>
                        )}
                      </div>

                      {isEditMode ? (
                        <Card>
                          <CardContent className="pt-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">{t("colSel")}</TableHead>
                                  <TableHead>{t("colArticle")}</TableHead>
                                  <TableHead className="w-24">{t("colQte")}</TableHead>
                                  <TableHead className="w-24">{t("colUnite")}</TableHead>
                                  <TableHead className="w-32">{t("colPrixUnit")}</TableHead>
                                  <TableHead className="w-32 text-right">{t("colTotal")}</TableHead>
                                  <TableHead className="w-12"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {Object.values(editedSuggestions).map((s) => (
                                  <TableRow key={s.id}>
                                    <TableCell><Checkbox checked={s.selectionne} onCheckedChange={(c) => setEdited(s.id, "selectionne", !!c)} /></TableCell>
                                    <TableCell><Input value={s.nomArticle} onChange={(e) => setEdited(s.id, "nomArticle", e.target.value)} className="h-8" /></TableCell>
                                    <TableCell><Input type="number" value={s.quantiteSuggeree} onChange={(e) => setEdited(s.id, "quantiteSuggeree", parseFloat(e.target.value) || 0)} className="h-8" min="0" step="0.1" /></TableCell>
                                    <TableCell><Input value={s.unite} onChange={(e) => setEdited(s.id, "unite", e.target.value)} className="h-8" /></TableCell>
                                    <TableCell><Input type="number" value={s.prixEstime} onChange={(e) => setEdited(s.id, "prixEstime", e.target.value)} className="h-8" min="0" step="0.01" /></TableCell>
                                    <TableCell className="text-right font-medium">{lineTotal(s).toFixed(2)}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-xs">{t("confiance", { n: s.confiance })}</Badge></TableCell>
                                  </TableRow>
                                ))}
                                {newSuggestions.map((s) => (
                                  <TableRow key={s.id} className="bg-green-50">
                                    <TableCell><Checkbox checked={s.selectionne} onCheckedChange={(c) => setNew(s.id, "selectionne", !!c)} /></TableCell>
                                    <TableCell><Input value={s.nomArticle} onChange={(e) => setNew(s.id, "nomArticle", e.target.value)} className="h-8" placeholder={t("nomArticlePlaceholder")} /></TableCell>
                                    <TableCell><Input type="number" value={s.quantiteSuggeree} onChange={(e) => setNew(s.id, "quantiteSuggeree", parseFloat(e.target.value) || 0)} className="h-8" min="0" step="0.1" /></TableCell>
                                    <TableCell><Input value={s.unite} onChange={(e) => setNew(s.id, "unite", e.target.value)} className="h-8" /></TableCell>
                                    <TableCell><Input type="number" value={s.prixEstime} onChange={(e) => setNew(s.id, "prixEstime", e.target.value)} className="h-8" min="0" step="0.01" /></TableCell>
                                    <TableCell className="text-right font-medium">{lineTotal(s).toFixed(2)}</TableCell>
                                    <TableCell><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeNewSuggestion(s.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <Button variant="outline" size="sm" onClick={addNewSuggestion}><Plus className="h-4 w-4 mr-2" />{t("ajouterArticle")}</Button>
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">{t("totalEstimeHt")}</p>
                                <p className="text-2xl font-bold">{total.toFixed(2)} €</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="space-y-4">
                          {analyseDetails.resultats.map((resultat) => (
                            <Card key={resultat.id}>
                              <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <CardTitle className="text-base">{resultat.typeTravauxDetecte}</CardTitle>
                                    <CardDescription>{resultat.descriptionTravaux}</CardDescription>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className={urgenceColor(resultat.urgence)}>{resultat.urgence || "moyenne"}</Badge>
                                    <Badge variant="outline">{t("confiance", { n: resultat.confiance })}</Badge>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <h4 className="text-sm font-semibold mb-2">{t("articlesSuggeres")}</h4>
                                <div className="space-y-2">
                                  {(resultat.suggestions || []).map((s) => (
                                    <div key={s.id} className="flex items-center justify-between p-2 border rounded">
                                      <div className="flex items-center gap-3">
                                        <Checkbox checked={!!s.selectionne} onCheckedChange={(c) => updateSuggestion.mutate({ id: s.id, selectionne: !!c })} />
                                        <div>
                                          <p className="font-medium">{s.nomArticle}</p>
                                          <p className="text-sm text-muted-foreground">{s.quantiteSuggeree} {s.unite}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-semibold">{parseFloat(String(s.prixEstime || "0")).toFixed(2)} €</p>
                                        <p className="text-sm text-muted-foreground">{t("confiance", { n: s.confiance })}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}

                      {/* Prévisualisation */}
                      {isEditMode && (
                        <Card className="mt-4 border-blue-200 bg-blue-50">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold text-blue-800">{t("previsualisation")}</h4>
                                <p className="text-sm text-blue-700">{t("articlesSelectionnes", { n: selectedCount(editedSuggestions, newSuggestions) })}</p>
                              </div>
                              <Button variant="outline" onClick={() => setShowPreview(!showPreview)}><Eye className="h-4 w-4 mr-2" />{showPreview ? t("masquer") : t("voir")} {t("voirDetail")}</Button>
                            </div>
                            {showPreview && (
                              <div className="mt-4 p-4 bg-white rounded-lg">
                                <h5 className="font-semibold mb-2">{t("recapitulatif")}</h5>
                                <div className="space-y-1 text-sm">
                                  {Object.values(editedSuggestions).filter((s) => s.selectionne).map((s) => (
                                    <div key={s.id} className="flex justify-between"><span>{t("articleLigne", { nom: s.nomArticle, qte: s.quantiteSuggeree })}</span><span>{lineTotal(s).toFixed(2)} €</span></div>
                                  ))}
                                  {newSuggestions.filter((s) => s.selectionne).map((s) => (
                                    <div key={s.id} className="flex justify-between text-green-700"><span>{t("articleLigneAjoute", { nom: s.nomArticle, qte: s.quantiteSuggeree })}</span><span>{lineTotal(s).toFixed(2)} €</span></div>
                                  ))}
                                  <div className="border-t pt-2 mt-2 font-semibold flex justify-between"><span>{t("totalHt")}</span><span>{total.toFixed(2)} €</span></div>
                                  <div className="flex justify-between"><span>{t("tva")}</span><span>{(total * TVA_RATE).toFixed(2)} €</span></div>
                                  <div className="flex justify-between text-lg font-bold"><span>{t("totalTtc")}</span><span>{(total * (1 + TVA_RATE)).toFixed(2)} €</span></div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Générer */}
                      {!analyseDetails.devisGenere && (
                        <Card className="mt-4">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold">{t("genererTitre")}</h4>
                                <p className="text-sm text-muted-foreground">{isEditMode ? t("genererDescEdit") : t("genererDescNormal")}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Select value={formData.clientId.toString()} onValueChange={(v) => setFormData({ ...formData, clientId: parseInt(v) })}>
                                  <SelectTrigger className="w-[200px]"><SelectValue placeholder={t("selClient")} /></SelectTrigger>
                                  <SelectContent>{clients.map((client) => (<SelectItem key={client.id} value={client.id.toString()}>{client.nom}</SelectItem>))}</SelectContent>
                                </Select>
                                <Button onClick={() => genererDevis.mutate({ analyseId: selectedAnalyse, clientId: formData.clientId }, { onSuccess: () => { toast.success(t("toastDevis")); setIsEditMode(false); setEditedSuggestions({}); setNewSuggestions([]); }, onError: (e) => toast.error(e.message) })} disabled={genererDevis.isPending || !formData.clientId || isEditMode}>
                                  {genererDevis.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t("generation")}</> : <><FileText className="h-4 w-4 mr-2" />{t("genererDevis")}</>}
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Devis généré */}
                      {analyseDetails.devisGenere && (
                        <Card className="mt-4 border-green-200 bg-green-50">
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-4">
                              <CheckCircle2 className="h-8 w-8 text-green-600" />
                              <div>
                                <h4 className="font-semibold text-green-800">{t("devisGenereTitre")}</h4>
                                <p className="text-sm text-green-700">{t("devisGenereMontant", { montant: parseFloat(String(analyseDetails.devisGenere.montantEstime || "0")).toFixed(2) })}</p>
                              </div>
                              <Button variant="outline" className="ml-auto"><Eye className="h-4 w-4 mr-2" />{t("voirDevis")}</Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t("selectionnezAnalyse")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
