import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Receipt, Camera, Upload, Sparkles, Loader2, ArrowLeft, ScanLine, X,
  CheckCircle2, Save, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

const MAX_SIZE = 5 * 1024 * 1024;
const TAUX_TVA_OPTIONS = [0, 5.5, 10, 20];
const MODES_PAIEMENT = [
  { value: "carte", label: "Carte bancaire" },
  { value: "especes", label: "Espèces" },
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
  { value: "prelevement", label: "Prélèvement" },
];

// Mapping categorie IA -> categorie utilisateur (label).
const CAT_IA_MAP: Record<string, string> = {
  materiaux: "Matériaux & Fournitures",
  carburant: "Carburant",
  outillage: "Outillage & Équipement",
  repas: "Repas & Restauration",
  deplacement: "Déplacement & Transport",
  telephone: "Téléphone & Internet",
  "sous-traitance": "Sous-traitance",
  assurance: "Assurances",
  loyer: "Loyer & Charges",
  formation: "Formation & Documentation",
  bancaire: "Frais bancaires",
  autre: "Autres frais",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function NouvelleDepense() {
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [iaFields, setIaFields] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    dateDepense: new Date().toISOString().slice(0, 10),
    fournisseur: "",
    categorie: "",
    sousCategorie: "",
    description: "",
    montantHt: "",
    tauxTva: "20",
    modePaiement: "carte",
    remboursable: true,
    tvaDeductible: true,
    notes: "",
    chantierId: undefined as number | undefined,
    clientId: undefined as number | undefined,
    recurrente: false,
    frequenceRecurrence: "mensuelle" as "hebdomadaire" | "mensuelle" | "trimestrielle" | "annuelle",
  });

  // Date de prochaine occurrence calculee a partir de la date de la depense
  // et de la frequence choisie (defaut +1 mois).
  const prochaineOccurrence = (() => {
    if (!form.recurrente || !form.dateDepense) return "";
    const d = new Date(form.dateDepense);
    if (form.frequenceRecurrence === "hebdomadaire") d.setDate(d.getDate() + 7);
    else if (form.frequenceRecurrence === "trimestrielle") d.setMonth(d.getMonth() + 3);
    else if (form.frequenceRecurrence === "annuelle") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const { data: categories } = trpc.depenses.getCategories.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const createMut = trpc.depenses.create.useMutation({
    onSuccess: () => {
      toast.success("Dépense enregistrée");
      setLocation("/depenses");
    },
    onError: (e) => toast.error(e.message || "Erreur lors de l'enregistrement"),
  });

  const createAndAnother = trpc.depenses.create.useMutation({
    onSuccess: () => {
      toast.success("Dépense enregistrée — saisis la suivante");
      // Reset form (garde date et categorie pour saisie rapide).
      setPhoto(null);
      setPhotoDataUrl("");
      setIaFields(new Set());
      setForm((f) => ({
        ...f,
        fournisseur: "",
        description: "",
        montantHt: "",
        notes: "",
      }));
    },
    onError: (e) => toast.error(e.message || "Erreur"),
  });

  const analyseMut = trpc.depenses.analyserJustificatif.useMutation({
    onSuccess: (res: any) => {
      setIsAnalyzing(false);
      if (!res?.success) {
        toast.error(res?.error || "Analyse impossible");
        return;
      }
      const d = res.data || {};
      const newIa = new Set<string>();
      setForm((f) => {
        const next = { ...f };
        if (d.fournisseur) { next.fournisseur = d.fournisseur; newIa.add("fournisseur"); }
        if (d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) { next.dateDepense = d.date; newIa.add("dateDepense"); }
        if (d.montantHT !== undefined) { next.montantHt = String(d.montantHT); newIa.add("montantHt"); }
        if (d.tauxTVA !== undefined) { next.tauxTva = String(d.tauxTVA); newIa.add("tauxTva"); }
        if (d.description) { next.description = d.description; newIa.add("description"); }
        if (d.categorie) {
          const mapped = CAT_IA_MAP[String(d.categorie).toLowerCase()] || "";
          if (mapped) { next.categorie = mapped; newIa.add("categorie"); }
        }
        return next;
      });
      setIaFields(newIa);
      toast.success(`✨ ${newIa.size} champ${newIa.size > 1 ? "s" : ""} rempli${newIa.size > 1 ? "s" : ""} par l'IA`);
    },
    onError: (e) => {
      setIsAnalyzing(false);
      toast.error(e.message || "Erreur OCR");
    },
  });

  async function handleFileSelect(file: File | null) {
    if (!file) return;
    if (file.size > MAX_SIZE) {
      toast.error("Le fichier dépasse 5 MB");
      return;
    }
    setPhoto(file);
    const url = await fileToDataUrl(file);
    setPhotoDataUrl(url);
  }

  function lancerOcr() {
    if (!photoDataUrl) {
      toast.error("Ajoute d'abord une photo");
      return;
    }
    setIsAnalyzing(true);
    analyseMut.mutate({ imageBase64: photoDataUrl });
  }

  // Auto-calcul TTC pour l'aperçu live.
  const montantHt = parseFloat(form.montantHt || "0");
  const tauxTva = parseFloat(form.tauxTva || "0");
  const montantTva = +(montantHt * tauxTva / 100).toFixed(2);
  const montantTtc = +(montantHt + montantTva).toFixed(2);

  function buildPayload() {
    return {
      dateDepense: form.dateDepense,
      fournisseur: form.fournisseur || undefined,
      categorie: form.categorie,
      sousCategorie: form.sousCategorie || undefined,
      description: form.description || undefined,
      montantHt,
      tauxTva,
      modePaiement: form.modePaiement,
      remboursable: form.remboursable,
      tvaDeductible: form.tvaDeductible,
      notes: form.notes || undefined,
      chantierId: form.chantierId,
      clientId: form.clientId,
      justificatifUrl: photoDataUrl || undefined,
      justificatifNom: photo?.name || undefined,
      recurrente: form.recurrente,
      frequenceRecurrence: form.recurrente ? form.frequenceRecurrence : undefined,
      prochaineOccurrence: form.recurrente ? prochaineOccurrence : undefined,
    };
  }

  function handleSave(soumettre: boolean, another: boolean) {
    if (!form.categorie) {
      toast.error("Choisis une catégorie");
      return;
    }
    if (!montantHt) {
      toast.error("Saisis un montant HT");
      return;
    }
    const payload = { ...buildPayload(), statut: soumettre ? "soumise" : "brouillon" };
    if (another) createAndAnother.mutate(payload as any);
    else createMut.mutate(payload as any);
  }

  function setField(key: keyof typeof form, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
    setIaFields((s) => {
      if (!s.has(String(key))) return s;
      const next = new Set(s);
      next.delete(String(key));
      return next;
    });
  }

  function iaBadge(key: string) {
    return iaFields.has(key) ? (
      <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px] ml-1">
        <Sparkles className="h-2.5 w-2.5 mr-0.5" /> IA
      </Badge>
    ) : null;
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/depenses")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Nouvelle dépense</h1>
      </div>

      {/* Section Scan IA */}
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-5 w-5 text-violet-600" />
            Scanner un justificatif (IA)
          </CardTitle>
          <CardDescription>
            Prends une photo de la facture, l'IA pré-remplit le formulaire automatiquement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!photoDataUrl ? (
            <div
              className="border-2 border-dashed border-violet-300 rounded-lg p-6 text-center cursor-pointer hover:bg-violet-50/40"
              onClick={() => inputRef.current?.click()}
            >
              <Camera className="h-8 w-8 text-violet-500 mx-auto mb-2" />
              <p className="text-sm font-medium">Prendre une photo ou parcourir</p>
              <p className="text-xs text-muted-foreground mt-1">JPG / PNG / WebP / HEIC — max 5 MB</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <div className="relative shrink-0">
                <img
                  src={photoDataUrl}
                  alt="Justificatif"
                  className="h-32 w-32 object-cover rounded-lg border"
                />
                <button
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                  onClick={() => {
                    setPhoto(null);
                    setPhotoDataUrl("");
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-sm text-muted-foreground truncate">{photo?.name}</p>
                <Button
                  onClick={lancerOcr}
                  disabled={isAnalyzing}
                  className="w-full sm:w-auto min-h-[44px]"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse en cours…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" /> Analyser avec l'IA
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulaire principal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Informations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Date {iaBadge("dateDepense")}</Label>
              <Input
                type="date"
                value={form.dateDepense}
                onChange={(e) => setField("dateDepense", e.target.value)}
              />
            </div>
            <div>
              <Label>Fournisseur {iaBadge("fournisseur")}</Label>
              <Input
                value={form.fournisseur}
                onChange={(e) => setField("fournisseur", e.target.value)}
                placeholder="Ex : Leroy Merlin"
              />
            </div>
          </div>

          <div>
            <Label>Catégorie * {iaBadge("categorie")}</Label>
            <Select
              value={form.categorie}
              onValueChange={(v) => setField("categorie", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                {(categories || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.nom}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.couleur || "#94a3b8" }}
                      />
                      {c.nom}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Description {iaBadge("description")}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={2}
              placeholder="Achat de vis, peinture blanche…"
            />
          </div>

          <div>
            <Label>Client lié (optionnel)</Label>
            <Select
              value={form.clientId ? String(form.clientId) : "none"}
              onValueChange={(v) => setField("clientId", v === "none" ? undefined : parseInt(v, 10))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Aucun" />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Montants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Montant HT * {iaBadge("montantHt")}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.montantHt}
                onChange={(e) => setField("montantHt", e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <Label>Taux TVA {iaBadge("tauxTva")}</Label>
              <Select
                value={form.tauxTva}
                onValueChange={(v) => setField("tauxTva", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAUX_TVA_OPTIONS.map((t) => (
                    <SelectItem key={t} value={String(t)}>{t}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant TVA</Label>
              <Input value={montantTva.toFixed(2)} readOnly className="bg-muted" />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-violet-50 border border-violet-200">
            <span className="text-sm font-medium">Total TTC</span>
            <span className="text-2xl font-bold text-violet-700">
              {montantTtc.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="tva-ded" className="cursor-pointer">TVA déductible</Label>
            <Switch
              id="tva-ded"
              checked={form.tvaDeductible}
              onCheckedChange={(v) => setField("tvaDeductible", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paiement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Mode de paiement</Label>
            <Select
              value={form.modePaiement}
              onValueChange={(v) => setField("modePaiement", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES_PAIEMENT.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="remb" className="cursor-pointer">Dépense remboursable</Label>
            <Switch
              id="remb"
              checked={form.remboursable}
              onCheckedChange={(v) => setField("remboursable", v)}
            />
          </div>
          <div>
            <Label>Notes internes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              placeholder="Optionnel"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Récurrence</CardTitle>
          <CardDescription>
            Pour les dépenses qui reviennent à intervalle régulier (loyer, abonnements…).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="rec" className="cursor-pointer">Dépense récurrente</Label>
            <Switch
              id="rec"
              checked={form.recurrente}
              onCheckedChange={(v) => setField("recurrente", v)}
            />
          </div>
          {form.recurrente && (
            <>
              <div>
                <Label>Fréquence</Label>
                <Select
                  value={form.frequenceRecurrence}
                  onValueChange={(v) => setField("frequenceRecurrence", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hebdomadaire">Hebdomadaire</SelectItem>
                    <SelectItem value="mensuelle">Mensuelle</SelectItem>
                    <SelectItem value="trimestrielle">Trimestrielle</SelectItem>
                    <SelectItem value="annuelle">Annuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 text-sm">
                <Sparkles className="h-4 w-4 inline mr-1 text-blue-600" />
                Cette dépense sera créée automatiquement le{" "}
                <strong>{prochaineOccurrence && new Date(prochaineOccurrence).toLocaleDateString("fr-FR")}</strong>,
                puis selon la fréquence choisie. Le scheduler quotidien s'occupe du reste.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2 pb-6">
        <Button
          variant="outline"
          className="flex-1 min-h-[44px]"
          onClick={() => handleSave(false, false)}
          disabled={createMut.isPending}
        >
          <Save className="h-4 w-4 mr-2" /> Brouillon
        </Button>
        <Button
          variant="outline"
          className="flex-1 min-h-[44px]"
          onClick={() => handleSave(false, true)}
          disabled={createAndAnother.isPending}
        >
          <Save className="h-4 w-4 mr-2" /> + autre
        </Button>
        <Button
          className="flex-1 min-h-[44px]"
          onClick={() => handleSave(true, false)}
          disabled={createMut.isPending}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" /> Soumettre
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
