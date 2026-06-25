import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Settings, FileText, Bell, Save, Palette, Upload, Trash2, Image, CreditCard, Globe, ExternalLink } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { AbonnementSection } from "@/features/abonnement/ui/abonnement-section";
import { useParametres } from "../application/use-parametres";
import {
  parametresToForm, formToUpdateInput, buildIcalUrl, demandeStatutClass, FORM_DEFAULTS,
  applyVitrineToForm, formToVitrineInput,
  type ParametresForm, type DelaiPaiementType,
} from "../domain/parametres";

const errMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function ParametresPage() {
  const { t } = useTranslation("parametres");
  const {
    parametres, artisan, icalFeed, demandes, vitrineSettings, isLoading, refetchArtisan,
    updateParametres, updateProfile, updateVitrine, regenerateIcal, updateDemandeStatut, convertirDemande,
  } = useParametres();

  const [formData, setFormData] = useState<ParametresForm>(FORM_DEFAULTS);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialTab = new URLSearchParams(window.location.search).get("tab") === "abonnement" ? "abonnement" : "general";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    if (parametres) setFormData(parametresToForm(parametres, artisan?.slug ?? ""));
  }, [parametres, artisan]);

  useEffect(() => {
    if (artisan) setLogoPreview(artisan.logo || null);
  }, [artisan]);

  /** Réglages vitrine (OPE-504) : fusionnés dans le formulaire dès chargement. */
  useEffect(() => {
    if (vitrineSettings) setFormData((prev) => applyVitrineToForm(prev, vitrineSettings));
  }, [vitrineSettings]);

  /** Toast post-checkout Stripe (?success=1 / ?canceled=1), puis on nettoie l'URL. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      toast.success("Abonnement actif. Bienvenue !");
      window.history.replaceState(null, "", "/parametres?tab=abonnement");
    } else if (params.get("canceled") === "1") {
      toast("Paiement annulé, vous pouvez réessayer quand vous voulez.");
      window.history.replaceState(null, "", "/parametres?tab=abonnement");
    }
  }, []);

  const icalUrl = buildIcalUrl(icalFeed?.path, window.location.origin);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParametres.mutate(formToUpdateInput(formData), {
      onSuccess: () => toast.success(t("toastEnregistre")),
      onError: () => toast.error(t("toastErreurEnregistrement")),
    });
    if (formData.slug && formData.slug !== (artisan?.slug || "")) {
      updateProfile.mutate({ slug: formData.slug }, { onError: (err) => toast.error(err.message || t("toastErreurSlug")) });
    }
    updateVitrine.mutate(formToVitrineInput(formData), { onError: (err) => toast.error(err.message) });
  };

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("logoTropVolumineux"));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const resp = await fetch("/api/upload-logo", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || t("logoErreurUpload")));
      }
      setLogoPreview(data.logoUrl);
      refetchArtisan();
      toast.success(t("logoTelecharge"));
    } catch (err) {
      toast.error(errMessage(err, t("logoErreurUpload")));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const resp = await fetch("/api/upload-logo", { method: "DELETE" });
      if (!resp.ok) throw new Error(t("logoErreurSuppression"));
      setLogoPreview(null);
      refetchArtisan();
      toast.success(t("logoSupprime"));
    } catch (err) {
      toast.error(errMessage(err, t("logoErreurSuppression")));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general" className="gap-2"><Settings className="h-4 w-4" />{t("tabGeneral")}</TabsTrigger>
          <TabsTrigger value="abonnement" className="gap-2"><CreditCard className="h-4 w-4" />{t("tabAbonnement")}</TabsTrigger>
        </TabsList>

        <TabsContent value="abonnement" className="mt-6">
          <AbonnementSection />
        </TabsContent>

        <TabsContent value="general" className="mt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" />{t("perso")}</CardTitle>
                <CardDescription>{t("persoDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>{t("logo")}</Label>
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors overflow-hidden" onClick={() => fileInputRef.current?.click()}>
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                      ) : (
                        <div className="text-center">
                          <Image className="h-8 w-8 mx-auto text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{t("cliquer")}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file); e.target.value = ""; }} />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <Upload className="h-4 w-4 mr-1.5" />{uploading ? t("envoi") : t("changerLogo")}
                      </Button>
                      {logoPreview && (
                        <Button type="button" variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={handleDeleteLogo}>
                          <Trash2 className="h-4 w-4 mr-1.5" />{t("supprimer")}
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="couleurPrincipale">{t("couleurPrincipale")}</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" id="couleurPrincipale" value={formData.couleurPrincipale} onChange={(e) => setFormData({ ...formData, couleurPrincipale: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                      <Input value={formData.couleurPrincipale} onChange={(e) => setFormData({ ...formData, couleurPrincipale: e.target.value })} className="max-w-[120px] font-mono text-sm" placeholder="#4F46E5" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="couleurSecondaire">{t("couleurSecondaire")}</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" id="couleurSecondaire" value={formData.couleurSecondaire} onChange={(e) => setFormData({ ...formData, couleurSecondaire: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                      <Input value={formData.couleurSecondaire} onChange={(e) => setFormData({ ...formData, couleurSecondaire: e.target.value })} className="max-w-[120px] font-mono text-sm" placeholder="#6366F1" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{t("numerotation")}</CardTitle>
                <CardDescription>{t("numerotationDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="prefixeDevis">{t("prefixeDevis")}</Label>
                    <Input id="prefixeDevis" value={formData.prefixeDevis} onChange={(e) => setFormData({ ...formData, prefixeDevis: e.target.value })} placeholder="DEV-" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prefixeFacture">{t("prefixeFacture")}</Label>
                    <Input id="prefixeFacture" value={formData.prefixeFacture} onChange={(e) => setFormData({ ...formData, prefixeFacture: e.target.value })} placeholder="FAC-" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delaiValiditeDevis">{t("delaiValidite")}</Label>
                  <Input id="delaiValiditeDevis" type="number" value={formData.delaiValiditeDevis} onChange={(e) => setFormData({ ...formData, delaiValiditeDevis: e.target.value })} className="max-w-xs" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />{t("mentions")}</CardTitle>
                <CardDescription>{t("mentionsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="conditionsPaiementDefaut">{t("conditionsPaiement")}</Label>
                  <Input id="conditionsPaiementDefaut" value={formData.conditionsPaiementDefaut} onChange={(e) => setFormData({ ...formData, conditionsPaiementDefaut: e.target.value })} placeholder="Paiement à 30 jours" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="delaiPaiementJours">{t("delaiPaiementJours")}</Label>
                    <Input id="delaiPaiementJours" type="number" min={0} max={365} value={formData.delaiPaiementJours} onChange={(e) => setFormData({ ...formData, delaiPaiementJours: e.target.value })} placeholder={t("delaiPaiementJoursPlaceholder")} />
                    <p className="text-xs text-muted-foreground">{t("delaiPaiementJoursHint")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delaiPaiementType">{t("delaiPaiementType")}</Label>
                    <select id="delaiPaiementType" value={formData.delaiPaiementType} onChange={(e) => setFormData({ ...formData, delaiPaiementType: e.target.value as DelaiPaiementType })} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="net">{t("delaiNet")}</option>
                      <option value="fin_de_mois">{t("delaiFinDeMois")}</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mentionsLegalesDevis">{t("mentionsLegales")}</Label>
                  <Textarea id="mentionsLegalesDevis" value={formData.mentionsLegalesDevis} onChange={(e) => setFormData({ ...formData, mentionsLegalesDevis: e.target.value })} placeholder={t("mentionsLegalesPlaceholder")} rows={4} />
                  <p className="text-xs text-muted-foreground">{t("mentionsLegalesHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mentionsLegalesFacture">{t("cgv")}</Label>
                  <Textarea id="mentionsLegalesFacture" value={formData.mentionsLegalesFacture} onChange={(e) => setFormData({ ...formData, mentionsLegalesFacture: e.target.value })} placeholder={t("cgvPlaceholder")} rows={6} />
                  <p className="text-xs text-muted-foreground">{t("cgvHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mediateurConsommation">{t("mediateurConsommation")}</Label>
                  <Input id="mediateurConsommation" value={formData.mediateurConsommation} onChange={(e) => setFormData({ ...formData, mediateurConsommation: e.target.value })} placeholder={t("mediateurConsommationPlaceholder")} maxLength={1000} />
                  <p className="text-xs text-muted-foreground">{t("mediateurConsommationHint")}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />{t("notifications")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t("notifEmail")}</Label>
                    <p className="text-sm text-muted-foreground">{t("notifEmailDesc")}</p>
                  </div>
                  <Switch checked={formData.notificationsEmail} onCheckedChange={(checked) => setFormData({ ...formData, notificationsEmail: checked })} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />{t("vitrineTitre")}</CardTitle>
                <CardDescription>{t("vitrineDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t("vitrineActive")}</Label>
                    <p className="text-sm text-muted-foreground">{t("vitrineActiveDesc")}</p>
                  </div>
                  <Switch checked={formData.vitrineActive} onCheckedChange={(checked) => setFormData({ ...formData, vitrineActive: checked })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">{t("vitrineUrl")}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{t("vitrineUrlPrefix")}</span>
                    <Input id="slug" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} placeholder={t("vitrineSlugPlaceholder")} className="max-w-xs" />
                  </div>
                  {formData.slug && (
                    <a href={`/vitrine/${formData.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" />{t("vitrineVoir")}
                    </a>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vitrineDescription">{t("vitrineDescription")}</Label>
                  <Textarea id="vitrineDescription" value={formData.vitrineDescription} onChange={(e) => setFormData({ ...formData, vitrineDescription: e.target.value })} placeholder={t("vitrineDescriptionPlaceholder")} rows={4} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vitrineZone">{t("vitrineZone")}</Label>
                    <Input id="vitrineZone" value={formData.vitrineZone} onChange={(e) => setFormData({ ...formData, vitrineZone: e.target.value })} placeholder={t("vitrineZonePlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vitrineExperience">{t("vitrineExperience")}</Label>
                    <Input id="vitrineExperience" type="number" value={formData.vitrineExperience} onChange={(e) => setFormData({ ...formData, vitrineExperience: e.target.value })} placeholder="15" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vitrineServices">{t("vitrineServices")}</Label>
                  <Textarea id="vitrineServices" value={formData.vitrineServices} onChange={(e) => setFormData({ ...formData, vitrineServices: e.target.value })} placeholder={t("vitrineServicesPlaceholder")} rows={4} />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateParametres.isPending}>
                <Save className="h-4 w-4 mr-2" />{updateParametres.isPending ? t("enregistrement") : t("enregistrer")}
              </Button>
            </div>
          </form>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("icalTitre")}</CardTitle>
              <CardDescription>{t("icalDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={icalUrl} placeholder={t("icalPlaceholder")} onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" disabled={!icalUrl} onClick={() => { if (icalUrl) { navigator.clipboard?.writeText(icalUrl); toast.success(t("icalCopie")); } }}>
                  {t("copier")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("icalAideHint")}</p>
              <Button type="button" variant="ghost" size="sm" disabled={regenerateIcal.isPending} onClick={() => regenerateIcal.mutate(undefined, { onSuccess: () => toast.success(t("icalRegenere")), onError: () => toast.error(t("icalErreurRegen")) })}>
                {t("icalRegenerer")}
              </Button>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("leadsTitre")}</CardTitle>
              <CardDescription>{t("leadsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {demandes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leadsAucune")}</p>
              ) : (
                <div className="space-y-3">
                  {demandes.map((d) => (
                    <div key={d.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-0.5">
                          <p className="font-medium">
                            {d.nom}
                            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${demandeStatutClass(d.statut)}`}>{d.statut}</span>
                          </p>
                          {d.email && <p className="text-xs text-muted-foreground">{d.email}</p>}
                          {d.telephone && <p className="text-xs text-muted-foreground">{d.telephone}</p>}
                          {d.message && <p className="text-sm mt-1 whitespace-pre-wrap">{d.message}</p>}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {d.statut !== "converti" && (
                            <Button type="button" size="sm" variant="outline" disabled={convertirDemande.isPending} onClick={() => convertirDemande.mutate({ id: d.id }, { onSuccess: () => toast.success(t("leadConverti")), onError: (e) => toast.error(e.message) })}>
                              {t("leadConvertir")}
                            </Button>
                          )}
                          {d.statut === "nouveau" && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => updateDemandeStatut.mutate({ id: d.id, statut: "contacte" }, { onError: (e) => toast.error(e.message) })}>
                              {t("leadMarquerContacte")}
                            </Button>
                          )}
                          {d.statut !== "perdu" && d.statut !== "converti" && (
                            <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => updateDemandeStatut.mutate({ id: d.id, statut: "perdu" }, { onError: (e) => toast.error(e.message) })}>
                              {t("leadMarquerPerdu")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
