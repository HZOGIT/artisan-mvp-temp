import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Camera, Upload, Loader2, Sparkles, FileText, ArrowRight, AlertCircle, CheckCircle2, X, ScanLine, History } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Badge } from "@/modern/shared/ui/badge";
import { Input } from "@/modern/shared/ui/input";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { useAnalysesPhotos } from "../application/use-analyses-photos";
import { eur, urgenceColor, totalEstime, suggestionMontant, isAccepted, safeErrorMsg, MAX_SIZE } from "../domain/analyses-photos";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Page `analyses-photos` — migration clean-archi de `pages/AnalysesPhotos.tsx`. Markup à l'identique.
// Workflow IA orchestré ici (createAnalyse→addPhoto→analyserPhotos), agrégats/assainissement en domain.
export default function AnalysesPhotosPage() {
  const { t } = useTranslation("analysesPhotos");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [interventionId, setInterventionId] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [analyseEnCoursId, setAnalyseEnCoursId] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { clients, interventions, artisanProfile, historique, analyseDetail, refetchHistorique, refetchDetail, createAnalyse, addPhoto, analyser, genererDevis } = useAnalysesPhotos(analyseEnCoursId);
  const metier = (artisanProfile?.metier || artisanProfile?.specialite || "").trim();

  function handleSelectFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (!isAccepted(f.name, f.type)) { toast.error(t("errFormat", { nom: f.name })); continue; }
      if (f.size > MAX_SIZE) { toast.error(t("errTaille", { nom: f.name })); continue; }
      next.push(f);
    }
    setFiles((prev) => [...prev, ...next]);
  }

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  async function lancerAnalyse() {
    if (files.length === 0) { toast.error(t("errPhoto")); return; }
    setIsAnalyzing(true);
    try {
      const analyse = await createAnalyse.mutateAsync({
        clientId: selectedClientId ?? undefined,
        titre: titre || t("titreDefaut", { date: format(new Date(), "dd/MM/yyyy") }),
        description: description || undefined,
      });
      if (!analyse?.id) throw new Error(t("errCreation"));
      const analyseId = analyse.id;
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await fileToDataUrl(files[i]);
        await addPhoto.mutateAsync({ analyseId, url: dataUrl, description: files[i].name, ordre: i });
      }
      await analyser.mutateAsync({ analyseId });
      setAnalyseEnCoursId(analyseId);
      toast.success(t("toastAnalyse"));
      refetchHistorique();
      refetchDetail();
      setFiles([]); setTitre(""); setDescription("");
    } catch (e) {
      toast.error(safeErrorMsg(e, t("errAnalyse")));
    } finally {
      setIsAnalyzing(false);
    }
  }

  function genererDevisDepuisAnalyse() {
    if (!analyseDetail || !selectedClientId) { toast.error(t("errClient")); return; }
    genererDevis.mutate({ analyseId: analyseDetail.id, clientId: selectedClientId }, {
      onSuccess: (devis) => {
        toast.success(t("toastDevis"));
        window.location.href = devis?.devisId ? `/devis/${devis.devisId}` : "/devis";
      },
      onError: (e) => toast.error(safeErrorMsg(e, t("errGenerationDevis"))),
    });
  }

  const resultats = analyseDetail?.resultats ?? [];
  const total = totalEstime(resultats);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><ScanLine className="h-7 w-7 text-violet-600" />{t("titre")}</h1>
        <p className="text-muted-foreground mt-1">{t("sousTitre")}</p>
        {metier && <Badge className="mt-2 bg-violet-100 text-violet-800 border border-violet-200">{t("optimisePour", { metier: metier.charAt(0).toUpperCase() + metier.slice(1) })}</Badge>}
      </div>

      {/* SECTION 1 — Nouvelle analyse */}
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-white dark:from-violet-950/10 dark:to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" /> {t("nouvelleAnalyse")}</CardTitle>
          <CardDescription>{t("nouvelleAnalyseDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleSelectFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={"border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors " + (dragOver ? "border-violet-500 bg-violet-100 dark:bg-violet-950/20" : "border-muted-foreground/30 hover:border-violet-400 hover:bg-violet-50/40 dark:hover:bg-violet-950/10")}
          >
            <Upload className="h-8 w-8 text-violet-500 mx-auto mb-2" />
            <p className="text-sm font-medium">{t("dropzoneTitre")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dropzoneDesc")}</p>
            <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleSelectFiles(e.target.files)} />
          </div>

          {files.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {files.map((f, idx) => (<FilePreview key={`${f.name}-${idx}`} file={f} onRemove={() => removeFile(idx)} />))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("titreLabel")}</label>
              <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={t("titrePlaceholder")} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("clientLabel")}</label>
              <Select value={selectedClientId ? String(selectedClientId) : "none"} onValueChange={(v) => setSelectedClientId(v === "none" ? null : parseInt(v, 10))}>
                <SelectTrigger><SelectValue placeholder={t("selClient")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("aucun")}</SelectItem>
                  {clients.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.prenom ? `${c.prenom} ` : ""}{c.nom}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("descriptionLabel")}</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} rows={2} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("interventionLabel")}</label>
            <Select value={interventionId ? String(interventionId) : "none"} onValueChange={(v) => setInterventionId(v === "none" ? null : parseInt(v, 10))}>
              <SelectTrigger><SelectValue placeholder={t("aucuneIntervention")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("aucune")}</SelectItem>
                {interventions.map((i) => (<SelectItem key={i.id} value={String(i.id)}>{i.titre} — {i.dateDebut ? format(new Date(i.dateDebut), "dd MMM", { locale: fr }) : ""}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={lancerAnalyse} disabled={isAnalyzing || files.length === 0} className="w-full min-h-[44px]" size="lg">
            {isAnalyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("analyseEnCours")}</> : <><Sparkles className="h-4 w-4 mr-2" /> {t("analyserIa")}</>}
          </Button>
        </CardContent>
      </Card>

      {/* SECTION 2 — Résultat */}
      {analyseDetail && (
        <Card className="border-emerald-200">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> {t("diagnosticIa")}</CardTitle>
                <CardDescription>{analyseDetail.titre || t("analyse")} — {analyseDetail.createdAt ? format(new Date(analyseDetail.createdAt), "dd MMM yyyy HH:mm", { locale: fr }) : ""}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAnalyseEnCoursId(null)}><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {resultats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aucunResultat")}</p>
            ) : (
              <>
                {resultats.map((r) => (
                  <div key={r.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{r.typeTravauxDetecte}</div>
                      <Badge className={urgenceColor(r.urgence)}>{r.urgence}</Badge>
                    </div>
                    {r.descriptionTravaux && <p className="text-sm text-muted-foreground">{r.descriptionTravaux}</p>}
                    {(r.suggestions || []).length > 0 && (
                      <div className="space-y-1 pt-2 border-t">
                        <div className="text-xs font-medium text-muted-foreground">{t("articlesSuggeres")}</div>
                        {r.suggestions.map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-sm">
                            <span className={s.selectionne ? "" : "line-through opacity-50"}>{s.nomArticle} — {s.quantiteSuggeree} {s.unite}</span>
                            <span className="font-mono text-xs">{eur(suggestionMontant(s))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200">
                  <span className="text-sm font-medium">{t("totalEstimeHt")}</span>
                  <span className="text-xl font-bold">{eur(total)}</span>
                </div>

                {analyseDetail.devisGenere ? (
                  <Button variant="outline" onClick={() => { window.location.href = `/devis/${analyseDetail.devisGenere?.devisId}`; }} className="w-full min-h-[44px]">
                    <FileText className="h-4 w-4 mr-2" /> {t("voirDevisGenere")}
                  </Button>
                ) : (
                  <Button onClick={genererDevisDepuisAnalyse} disabled={genererDevis.isPending || !selectedClientId} className="w-full min-h-[44px]">
                    {genererDevis.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                    {t("creerDevis")}<ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
                {!selectedClientId && !analyseDetail.devisGenere && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {t("selClientActiver")}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* SECTION 3 — Historique */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> {t("historiqueTitre")}</CardTitle>
          <CardDescription>{t("historiqueDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {historique.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("aucuneAnalyse")}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {historique.map((a) => (
                <button key={a.id} onClick={() => setAnalyseEnCoursId(a.id)} className="text-left p-3 rounded-lg border hover:border-violet-400 hover:bg-violet-50/40 dark:hover:bg-violet-950/10 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center shrink-0"><Camera className="h-5 w-5 text-violet-600" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{a.titre || t("analyseNum", { id: a.id })}</div>
                      <div className="text-xs text-muted-foreground">{a.createdAt ? format(new Date(a.createdAt), "dd MMM yyyy HH:mm", { locale: fr }) : ""}</div>
                      <Badge variant="secondary" className="mt-1 text-[10px]">{a.statut}</Badge>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Sous-composant : preview locale d'un File (lit en data URL pour l'aperçu).
function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const { t } = useTranslation("analysesPhotos");
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    fileToDataUrl(file).then((url) => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [file]);
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden border bg-muted">
      {src && <img src={src} alt={file.name} className="h-full w-full object-cover" />}
      <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80" title={t("retirer")}>
        <X className="h-3 w-3" />
      </button>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] p-1 truncate">{file.name}</div>
    </div>
  );
}
