import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Receipt, Camera, Sparkles, Loader2, ArrowLeft, ScanLine, X, CheckCircle2, Save, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Switch } from "@/shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { useNouvelleDepense } from "../application/use-nouvelle-depense";
import { defaultForm, montants, prochaineOccurrence, applyOcr, buildPayload, FREQUENCES, TAUX_TVA_OPTIONS, MODES_PAIEMENT, type DepenseForm, type ModePaiement, type Frequence } from "../domain/nouvelle-depense";

const MAX_SIZE = 5 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/*
 * Page `nouvelle-depense` — migration clean-archi de `pages/NouvelleDepense.tsx`. Markup à l'identique
 * (sauf fréquence « hebdomadaire » retirée : non supportée par le backend, cf. finding). Logique pure en domain.
 */
export default function NouvelleDepensePage() {
  const { t } = useTranslation("nouvelleDepense");
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [iaFields, setIaFields] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<DepenseForm>(defaultForm);

  const { ht, tva, ttc } = montants(form.montantHt, form.tauxTva);
  const occ = prochaineOccurrence(form.dateDepense, form.recurrente, form.frequenceRecurrence);

  /** détection NON bloquante de doublons (debouncée). */
  const [doublonKey, setDoublonKey] = useState({ montantTtc: 0, dateDepense: "", fournisseur: "" });
  useEffect(() => {
    const id = setTimeout(() => setDoublonKey({ montantTtc: ttc, dateDepense: form.dateDepense, fournisseur: form.fournisseur }), 500);
    return () => clearTimeout(id);
  }, [ttc, form.dateDepense, form.fournisseur]);

  const { categories, clients, doublons, create, analyser } = useNouvelleDepense(doublonKey);

  async function handleFileSelect(file: File | null) {
    if (!file) return;
    if (file.size > MAX_SIZE) { toast.error(t("errTaille")); return; }
    setPhoto(file);
    setPhotoDataUrl(await fileToDataUrl(file));
  }

  function lancerOcr() {
    if (!photoDataUrl) { toast.error(t("errPhoto")); return; }
    analyser.mutate({ imageBase64: photoDataUrl }, {
      onSuccess: (res) => {
        if (!res?.success) { toast.error(res?.error || t("errAnalyse")); return; }
        const { form: next, iaFields: ia } = applyOcr(form, res.data ?? {});
        setForm(next);
        setIaFields(ia);
        toast.success(t("toastIaRemplis", { count: ia.size }));
      },
      onError: (e) => toast.error(e.message || t("errOcr")),
    });
  }

  function setField<K extends keyof DepenseForm>(key: K, value: DepenseForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setIaFields((s) => {
      if (!s.has(String(key))) return s;
      const next = new Set(s);
      next.delete(String(key));
      return next;
    });
  }

  function handleSave(another: boolean) {
    if (!form.categorie) { toast.error(t("errCategorie")); return; }
    if (!ht) { toast.error(t("errMontant")); return; }
    const payload = buildPayload(form, { photoDataUrl, photoNom: photo?.name });
    create.mutate(payload, {
      onSuccess: () => {
        if (another) {
          toast.success(t("toastSuivante"));
          setPhoto(null); setPhotoDataUrl(""); setIaFields(new Set());
          setForm((f) => ({ ...f, fournisseur: "", description: "", montantHt: "", notes: "" }));
        } else {
          toast.success(t("toastEnregistree"));
          window.location.href = "/depenses";
        }
      },
      onError: (e) => toast.error(e.message || t("toastErreur")),
    });
  }

  const iaBadge = (key: string) => iaFields.has(key) ? (
    <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px] ml-1"><Sparkles className="h-2.5 w-2.5 mr-0.5" /> {t("iaTag")}</Badge>
  ) : null;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => { window.location.href = "/depenses"; }}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold">{t("titre")}</h1>
      </div>

      {/* Scan IA */}
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ScanLine className="h-5 w-5 text-violet-600" />{t("scanTitre")}</CardTitle>
          <CardDescription>{t("scanDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!photoDataUrl ? (
            <div className="border-2 border-dashed border-violet-300 rounded-lg p-6 text-center cursor-pointer hover:bg-violet-50/40" onClick={() => inputRef.current?.click()}>
              <Camera className="h-8 w-8 text-violet-500 mx-auto mb-2" />
              <p className="text-sm font-medium">{t("prendrePhoto")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("formatsMax")}</p>
              <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <div className="relative shrink-0">
                <img src={photoDataUrl} alt={t("scanTitre")} className="h-32 w-32 object-cover rounded-lg border" />
                <button className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center" onClick={() => { setPhoto(null); setPhotoDataUrl(""); }}><X className="h-3 w-3" /></button>
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-sm text-muted-foreground truncate">{photo?.name}</p>
                <Button onClick={lancerOcr} disabled={analyser.isPending} className="w-full sm:w-auto min-h-[44px]">
                  {analyser.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("analyseEnCours")}</> : <><Sparkles className="h-4 w-4 mr-2" /> {t("analyserIa")}</>}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informations */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" />{t("informations")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("date")} {iaBadge("dateDepense")}</Label>
              <Input type="date" value={form.dateDepense} onChange={(e) => setField("dateDepense", e.target.value)} />
            </div>
            <div>
              <Label>{t("fournisseur")} {iaBadge("fournisseur")}</Label>
              <Input value={form.fournisseur} onChange={(e) => setField("fournisseur", e.target.value)} placeholder={t("fournisseurPlaceholder")} />
            </div>
          </div>
          <div>
            <Label>{t("categorie")} {iaBadge("categorie")}</Label>
            <Select value={form.categorie} onValueChange={(v) => setField("categorie", v)}>
              <SelectTrigger><SelectValue placeholder={t("selectionner")} /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.nom}>
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.couleur || "#94a3b8" }} />{c.nom}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("description")} {iaBadge("description")}</Label>
            <Textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={2} placeholder={t("descriptionPlaceholder")} />
          </div>
          <div>
            <Label>{t("clientLie")}</Label>
            <Select value={form.clientId ? String(form.clientId) : "none"} onValueChange={(v) => setField("clientId", v === "none" ? undefined : parseInt(v, 10))}>
              <SelectTrigger><SelectValue placeholder={t("aucun")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("aucun")}</SelectItem>
                {clients.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.prenom ? `${c.prenom} ` : ""}{c.nom}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Montants */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t("montants")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>{t("montantHt")} {iaBadge("montantHt")}</Label>
              <Input type="number" step="0.01" value={form.montantHt} onChange={(e) => setField("montantHt", e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>{t("tauxTva")} {iaBadge("tauxTva")}</Label>
              <Select value={form.tauxTva} onValueChange={(v) => setField("tauxTva", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TAUX_TVA_OPTIONS.map((tx) => (<SelectItem key={tx} value={String(tx)}>{tx}%</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("montantTva")}</Label>
              <Input value={tva.toFixed(2)} readOnly className="bg-muted" />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-violet-50 border border-violet-200">
            <span className="text-sm font-medium">{t("totalTtc")}</span>
            <span className="text-2xl font-bold text-violet-700">{ttc.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span>
          </div>
          {doublons.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-800">
              <div className="flex items-start gap-2">
                <ScanLine className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">{t("doublonTitre", { count: doublons.length })}</p>
                  <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
                    {doublons.slice(0, 5).map((d) => (
                      <li key={d.id}>
                        {d.numero ? `${d.numero} — ` : ""}
                        {Number(d.montantTtc).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                        {" le "}{new Date(d.dateDepense).toLocaleDateString("fr-FR")}
                        {d.fournisseur ? ` — ${d.fournisseur}` : ""}{d.description ? ` (${d.description})` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs">{t("doublonAvertissement")}</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="tva-ded" className="cursor-pointer">{t("tvaDeductible")}</Label>
            <Switch id="tva-ded" checked={form.tvaDeductible} onCheckedChange={(v) => setField("tvaDeductible", v)} />
          </div>
          {form.tvaDeductible && (
            <div>
              <Label htmlFor="coeff-ded">{t("coeffDeductibilite")}</Label>
              <Input
                id="coeff-ded"
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.coeffDeductibilite}
                onChange={(e) => setField("coeffDeductibilite", e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">{t("coeffDeductibiliteDesc")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paiement */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t("paiement")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("modePaiement")}</Label>
            <Select value={form.modePaiement} onValueChange={(v) => setField("modePaiement", v as ModePaiement)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES_PAIEMENT.map((m) => (<SelectItem key={m} value={m}>{t(`mode.${m}`)}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="remb" className="cursor-pointer">{t("depenseRemboursable")}</Label>
            <Switch id="remb" checked={form.remboursable} onCheckedChange={(v) => setField("remboursable", v)} />
          </div>
          <div>
            <Label>{t("notesInternes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} placeholder={t("optionnel")} />
          </div>
        </CardContent>
      </Card>

      {/* Récurrence */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("recurrence")}</CardTitle>
          <CardDescription>{t("recurrenceDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="rec" className="cursor-pointer">{t("depenseRecurrente")}</Label>
            <Switch id="rec" checked={form.recurrente} onCheckedChange={(v) => setField("recurrente", v)} />
          </div>
          {form.recurrente && (
            <>
              <div>
                <Label>{t("frequence")}</Label>
                <Select value={form.frequenceRecurrence} onValueChange={(v) => setField("frequenceRecurrence", v as Frequence)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCES.map((fr) => (<SelectItem key={fr} value={fr}>{t(`freq.${fr}`)}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 text-sm">
                <Sparkles className="h-4 w-4 inline mr-1 text-blue-600" />
                {t("recurrenceInfo", { date: occ && new Date(occ).toLocaleDateString("fr-FR") })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2 pb-6">
        <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => handleSave(false)} disabled={create.isPending}>
          <Save className="h-4 w-4 mr-2" /> {t("brouillon")}
        </Button>
        <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => handleSave(true)} disabled={create.isPending}>
          <Save className="h-4 w-4 mr-2" /> {t("autre")}
        </Button>
        <Button className="flex-1 min-h-[44px]" onClick={() => handleSave(false)} disabled={create.isPending}>
          <CheckCircle2 className="h-4 w-4 mr-2" /> {t("soumettre")}<ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
