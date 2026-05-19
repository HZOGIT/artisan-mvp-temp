import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Upload,
  Loader2,
  Sparkles,
  FileText,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  X,
  ScanLine,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB par fichier — limite raisonnable pour
                                  // le transport JSON tRPC sans saturer le body-parser.
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function eur(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function urgenceColor(u: string): string {
  if (u === "critique") return "bg-rose-100 text-rose-800 border-rose-300";
  if (u === "haute") return "bg-orange-100 text-orange-800 border-orange-300";
  if (u === "moyenne") return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Defense en profondeur : ne JAMAIS afficher un toast contenant un payload
// base64 brut (ce qui generait l'affichage 'long base64 a droite de l'ecran').
// On strip toute data: URL et on tronque a 240 caracteres.
function safeErrorMsg(e: any, fallback = "Erreur"): string {
  let msg = String(e?.message || e || fallback);
  msg = msg.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
  // Long base64 isole sans prefixe data:
  msg = msg.replace(/[A-Za-z0-9+/=]{200,}/g, "[…]");
  if (msg.length > 240) msg = msg.slice(0, 240) + "…";
  return msg;
}

export default function AnalysesPhotos() {
  const [, setLocation] = useLocation();
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [interventionId, setInterventionId] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [analyseEnCoursId, setAnalyseEnCoursId] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: clients } = trpc.clients.list.useQuery();
  const { data: interventions } = trpc.interventions.list.useQuery();
  const { data: historique, refetch: refetchHistorique } = trpc.devisIA.list.useQuery();
  const { data: analyseDetail, refetch: refetchDetail } = trpc.devisIA.getById.useQuery(
    { id: analyseEnCoursId || 0 },
    { enabled: !!analyseEnCoursId }
  );

  const createAnalyseMut = trpc.devisIA.createAnalyse.useMutation();
  const addPhotoMut = trpc.devisIA.addPhoto.useMutation();
  const analyserMut = trpc.devisIA.analyserPhotos.useMutation();
  const genererDevisMut = trpc.devisIA.genererDevis.useMutation({
    onSuccess: (devis: any) => {
      toast.success("Devis brouillon généré depuis l'analyse");
      if (devis?.devisId) setLocation(`/devis/${devis.devisId}`);
      else setLocation("/devis");
    },
    onError: (e) => toast.error(safeErrorMsg(e, "Échec de la génération du devis")),
  });

  function handleSelectFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED.includes(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) {
        toast.error(`${f.name} : format non supporté`);
        continue;
      }
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name} : dépasse 5 MB`);
        continue;
      }
      next.push(f);
    }
    setFiles((prev) => [...prev, ...next]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function lancerAnalyse() {
    if (files.length === 0) {
      toast.error("Ajoute au moins une photo");
      return;
    }
    setIsAnalyzing(true);
    try {
      const analyse = await createAnalyseMut.mutateAsync({
        clientId: selectedClientId ?? undefined,
        titre: titre || `Analyse du ${format(new Date(), "dd/MM/yyyy")}`,
        description: description || undefined,
      });
      if (!analyse?.id) throw new Error("Création de l'analyse échouée");
      const analyseId = analyse.id;

      // Encode + envoie les fichiers les uns après les autres pour eviter de
      // saturer le pipe tRPC avec 5+ data URLs en parallèle.
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await fileToDataUrl(files[i]);
        await addPhotoMut.mutateAsync({
          analyseId,
          url: dataUrl,
          description: files[i].name,
          ordre: i,
        });
      }

      await analyserMut.mutateAsync({ analyseId });

      setAnalyseEnCoursId(analyseId);
      toast.success("Analyse IA terminée");
      refetchHistorique();
      refetchDetail();
      // Reset upload zone
      setFiles([]);
      setTitre("");
      setDescription("");
    } catch (e: any) {
      toast.error(safeErrorMsg(e, "Erreur pendant l'analyse"));
    } finally {
      setIsAnalyzing(false);
    }
  }

  function genererDevisDepuisAnalyse() {
    if (!analyseDetail || !selectedClientId) {
      toast.error("Sélectionne un client pour générer le devis");
      return;
    }
    genererDevisMut.mutate({
      analyseId: analyseDetail.id,
      clientId: selectedClientId,
    });
  }

  // Total estime (somme des suggestions selectionnees) pour aperçu.
  const totalEstime = (analyseDetail?.resultats || []).reduce((sum: number, r: any) => {
    const sub = (r.suggestions || []).reduce((s2: number, s: any) => {
      if (!s.selectionne) return s2;
      return s2 + Number(s.quantiteSuggeree || 0) * Number(s.prixEstime || 0);
    }, 0);
    return sum + sub;
  }, 0);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ScanLine className="h-7 w-7 text-violet-600" />
          Analyse photos IA
        </h1>
        <p className="text-muted-foreground mt-1">
          Prends une photo d'un problème, l'IA identifie les travaux et propose un devis.
        </p>
      </div>

      {/* SECTION 1 — Nouvelle analyse */}
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-white dark:from-violet-950/10 dark:to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" /> Nouvelle analyse
          </CardTitle>
          <CardDescription>
            Photos JPG / PNG / WebP / HEIC — max 5 MB par fichier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleSelectFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors " +
              (dragOver
                ? "border-violet-500 bg-violet-100 dark:bg-violet-950/20"
                : "border-muted-foreground/30 hover:border-violet-400 hover:bg-violet-50/40 dark:hover:bg-violet-950/10")
            }
          >
            <Upload className="h-8 w-8 text-violet-500 mx-auto mb-2" />
            <p className="text-sm font-medium">Glisse tes photos ici ou clique pour parcourir</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tu peux ajouter plusieurs photos (chantier, fuite, dégât…)
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleSelectFiles(e.target.files)}
            />
          </div>

          {/* Preview des fichiers selectionnes */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {files.map((f, idx) => (
                <FilePreview key={`${f.name}-${idx}`} file={f} onRemove={() => removeFile(idx)} />
              ))}
            </div>
          )}

          {/* Metadonnees optionnelles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Titre (optionnel)</label>
              <Input
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Ex : Fuite cuisine M. Dupont"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Client (optionnel)</label>
              <Select
                value={selectedClientId ? String(selectedClientId) : "none"}
                onValueChange={(v) => setSelectedClientId(v === "none" ? null : parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {(clients || []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.prenom ? `${c.prenom} ` : ""}{c.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description (optionnel)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contexte, observations, demande du client…"
              rows={2}
            />
          </div>

          {/* Section liaison intervention */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Lier à une intervention (optionnel)
            </label>
            <Select
              value={interventionId ? String(interventionId) : "none"}
              onValueChange={(v) => setInterventionId(v === "none" ? null : parseInt(v, 10))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Aucune intervention" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune</SelectItem>
                {(interventions || []).map((i: any) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.titre} — {i.dateDebut ? format(new Date(i.dateDebut), "dd MMM", { locale: fr }) : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={lancerAnalyse}
            disabled={isAnalyzing || files.length === 0}
            className="w-full min-h-[44px]"
            size="lg"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyse en cours (peut prendre 5-10s)…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Analyser avec l'IA
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* SECTION 2 — Resultat de l'analyse courante */}
      {analyseDetail && (
        <Card className="border-emerald-200">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Diagnostic IA
                </CardTitle>
                <CardDescription>
                  {analyseDetail.titre || "Analyse"} —{" "}
                  {analyseDetail.createdAt
                    ? format(new Date(analyseDetail.createdAt), "dd MMM yyyy HH:mm", { locale: fr })
                    : ""}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAnalyseEnCoursId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(analyseDetail.resultats || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun résultat encore disponible.</p>
            ) : (
              <>
                {(analyseDetail.resultats || []).map((r: any) => (
                  <div key={r.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{r.typeTravauxDetecte}</div>
                      <Badge className={urgenceColor(r.urgence)}>{r.urgence}</Badge>
                    </div>
                    {r.descriptionTravaux && (
                      <p className="text-sm text-muted-foreground">{r.descriptionTravaux}</p>
                    )}
                    {(r.suggestions || []).length > 0 && (
                      <div className="space-y-1 pt-2 border-t">
                        <div className="text-xs font-medium text-muted-foreground">
                          Articles suggérés :
                        </div>
                        {(r.suggestions || []).map((s: any) => (
                          <div key={s.id} className="flex items-center justify-between text-sm">
                            <span className={s.selectionne ? "" : "line-through opacity-50"}>
                              {s.nomArticle} — {s.quantiteSuggeree} {s.unite}
                            </span>
                            <span className="font-mono text-xs">
                              {eur(Number(s.quantiteSuggeree || 0) * Number(s.prixEstime || 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200">
                  <span className="text-sm font-medium">Total estimé HT</span>
                  <span className="text-xl font-bold">{eur(totalEstime)}</span>
                </div>

                {analyseDetail.devisGenere ? (
                  <Button
                    variant="outline"
                    onClick={() => setLocation(`/devis/${analyseDetail.devisGenere.devisId}`)}
                    className="w-full min-h-[44px]"
                  >
                    <FileText className="h-4 w-4 mr-2" /> Voir le devis généré
                  </Button>
                ) : (
                  <Button
                    onClick={genererDevisDepuisAnalyse}
                    disabled={genererDevisMut.isPending || !selectedClientId}
                    className="w-full min-h-[44px]"
                  >
                    {genererDevisMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Créer un devis depuis cette analyse
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
                {!selectedClientId && !analyseDetail.devisGenere && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Sélectionne un client ci-dessus pour activer la génération.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* SECTION 3 — Historique */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Historique des analyses
          </CardTitle>
          <CardDescription>Reprends une analyse précédente</CardDescription>
        </CardHeader>
        <CardContent>
          {!historique || historique.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucune analyse encore. Lance ta première avec une photo ci-dessus.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {historique.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => setAnalyseEnCoursId(a.id)}
                  className="text-left p-3 rounded-lg border hover:border-violet-400 hover:bg-violet-50/40 dark:hover:bg-violet-950/10 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center shrink-0">
                      <Camera className="h-5 w-5 text-violet-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{a.titre || `Analyse #${a.id}`}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.createdAt
                          ? format(new Date(a.createdAt), "dd MMM yyyy HH:mm", { locale: fr })
                          : ""}
                      </div>
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {a.statut}
                      </Badge>
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
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    fileToDataUrl(file).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden border bg-muted">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={file.name} className="h-full w-full object-cover" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
        title="Retirer"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] p-1 truncate">
        {file.name}
      </div>
    </div>
  );
}
