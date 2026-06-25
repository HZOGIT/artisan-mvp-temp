import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Globe, ExternalLink, Copy, Save, Star, MessageSquare, Eye, Send, Link2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Switch } from "@/shared/ui/switch";
import { Badge } from "@/shared/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useMaVitrine } from "../application/use-ma-vitrine";
import { parseServices, buildVitrineUrl, avisStatutClass, avisStatutIsSecondary, formatDate, type VitrineForm } from "../domain/ma-vitrine";

/*
 * Page `ma-vitrine` (page publique + avis) — migration clean-archi de `pages/MaVitrine.tsx`. Markup à
 * l'identique. tRPC encapsulé dans `use-ma-vitrine`, règles pures en domain.
 */
const EMPTY: VitrineForm = { vitrineActive: false, vitrineDescription: "", vitrineZone: "", vitrineServices: "", vitrineExperience: "", slug: "" };

function Stars({ note }: { note: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={`h-4 w-4 ${star <= note ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
      ))}
    </div>
  );
}

export default function MaVitrinePage() {
  const { t } = useTranslation("maVitrine");
  const { parametres, artisan, avis, clients, updateParametres, updateProfile, repondre, moderer, envoyerDemande } = useMaVitrine();
  const [formData, setFormData] = useState<VitrineForm>(EMPTY);
  const [repondreAvisId, setRepondreAvisId] = useState<number | null>(null);
  const [reponse, setReponse] = useState("");
  const [demandeClientId, setDemandeClientId] = useState("");
  const [showDemandeDialog, setShowDemandeDialog] = useState(false);

  useEffect(() => {
    if (!parametres) return;
    setFormData((prev) => ({
      ...prev,
      vitrineActive: parametres.vitrineActive ?? false,
      vitrineDescription: parametres.vitrineDescription || "",
      vitrineZone: parametres.vitrineZone || "",
      vitrineServices: parseServices(parametres.vitrineServices),
      vitrineExperience: String(parametres.vitrineExperience || ""),
    }));
  }, [parametres]);

  useEffect(() => {
    if (artisan?.slug) setFormData((prev) => ({ ...prev, slug: artisan.slug || "" }));
  }, [artisan]);

  const vitrineUrl = buildVitrineUrl(window.location.origin, formData.slug);

  const handleCopy = () => {
    if (vitrineUrl) { navigator.clipboard.writeText(vitrineUrl); toast.success(t("toastLienCopie")); }
  };

  const handleSave = () => {
    updateParametres.mutate(
      {
        vitrineActive: formData.vitrineActive,
        vitrineDescription: formData.vitrineDescription,
        vitrineZone: formData.vitrineZone,
        vitrineServices: formData.vitrineServices,
        vitrineExperience: formData.vitrineExperience ? parseInt(formData.vitrineExperience) : undefined,
      },
      { onSuccess: () => toast.success(t("toastVitrineMaj")), onError: () => toast.error(t("toastVitrineErr")) },
    );
    if (formData.slug && formData.slug !== (artisan?.slug || "")) {
      updateProfile.mutate({ slug: formData.slug }, { onSuccess: () => toast.success(t("toastSlugMaj")), onError: (e) => toast.error(e.message) });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6" />{t("titre")}</h1>
        <p className="text-muted-foreground">{t("sousTitre")}</p>
      </div>

      {/* Lien public + toggle */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />{t("lienPublic")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {vitrineUrl ? (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <a href={vitrineUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-primary hover:underline truncate">{vitrineUrl}</a>
              <Button variant="outline" size="sm" onClick={handleCopy}><Copy className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" asChild>
                <a href={vitrineUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" />{t("voirVitrine")}</a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("configurerSlug")}</p>
          )}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("vitrineActive")}</Label>
              <p className="text-sm text-muted-foreground">{t("vitrineActiveDesc")}</p>
            </div>
            <Switch checked={formData.vitrineActive} onCheckedChange={(checked) => setFormData({ ...formData, vitrineActive: checked })} />
          </div>
        </CardContent>
      </Card>

      {/* Personnalisation */}
      <Card>
        <CardHeader>
          <CardTitle>{t("personnalisation")}</CardTitle>
          <CardDescription>{t("personnalisationDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">{t("urlVitrine")}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">{t("vitrineUrlPrefix")}</span>
              <Input id="slug" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} placeholder={t("slugPlaceholder")} className="max-w-xs" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vitrineDescription">{t("descriptionEntreprise")}</Label>
            <Textarea id="vitrineDescription" value={formData.vitrineDescription} onChange={(e) => setFormData({ ...formData, vitrineDescription: e.target.value })} placeholder={t("descriptionPlaceholder")} rows={4} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vitrineZone">{t("zoneIntervention")}</Label>
              <Input id="vitrineZone" value={formData.vitrineZone} onChange={(e) => setFormData({ ...formData, vitrineZone: e.target.value })} placeholder={t("zonePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vitrineExperience">{t("anneesExperience")}</Label>
              <Input id="vitrineExperience" type="number" value={formData.vitrineExperience} onChange={(e) => setFormData({ ...formData, vitrineExperience: e.target.value })} placeholder={t("experiencePlaceholder")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vitrineServices">{t("servicesProposes")}</Label>
            <Textarea id="vitrineServices" value={formData.vitrineServices} onChange={(e) => setFormData({ ...formData, vitrineServices: e.target.value })} placeholder={t("servicesPlaceholder")} rows={4} />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={updateParametres.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updateParametres.isPending ? t("enregistrement") : t("enregistrer")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Avis clients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Star className="h-5 w-5" />{t("avisClients", { count: avis.length })}</CardTitle>
            <CardDescription>{t("avisDesc")}</CardDescription>
          </div>
          <Button onClick={() => setShowDemandeDialog(true)}><Send className="h-4 w-4 mr-2" />{t("demanderAvis")}</Button>
        </CardHeader>
        <CardContent>
          {avis.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("aucunAvis")}</div>
          ) : (
            <div className="space-y-4">
              {avis.map((a) => {
                const statut = a.statut || "attente";
                const cls = avisStatutClass(statut);
                const statutKey = statut === "publie" ? "publie" : statut === "masque" ? "masque" : "attente";
                return (
                  <div key={a.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <Stars note={a.note} />
                          <Badge className={cls ?? undefined} variant={avisStatutIsSecondary(statut) ? "secondary" : undefined}>{t(`statut.${statutKey}`)}</Badge>
                        </div>
                        <p className="font-medium">{a.client?.nom || t("client")}</p>
                        {a.commentaire && <p className="mt-1 text-sm">{a.commentaire}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(a.createdAt)}</p>
                        {a.reponseArtisan && (
                          <div className="mt-3 p-3 bg-muted rounded-lg">
                            <p className="text-sm font-medium">{t("votreReponse")}</p>
                            <p className="text-sm mt-1">{a.reponseArtisan}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4 shrink-0">
                        {!a.reponseArtisan && (
                          <Button variant="outline" size="sm" onClick={() => setRepondreAvisId(a.id)}><MessageSquare className="h-4 w-4 mr-1" />{t("repondre")}</Button>
                        )}
                        {statut !== "publie" && (
                          <Button variant="outline" size="sm" onClick={() => moderer.mutate({ avisId: a.id, statut: "publie" }, { onSuccess: () => toast.success(t("toastModere")), onError: (e) => toast.error(e.message) })}>
                            <Eye className="h-4 w-4 mr-1" />{t("publier")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog répondre */}
      <Dialog open={!!repondreAvisId} onOpenChange={() => setRepondreAvisId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("repondreTitre")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Textarea value={reponse} onChange={(e) => setReponse(e.target.value)} placeholder={t("reponsePlaceholder")} rows={4} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRepondreAvisId(null)}>{t("annuler")}</Button>
              <Button
                onClick={() => {
                  if (repondreAvisId && reponse.trim()) {
                    repondre.mutate({ avisId: repondreAvisId, reponse: reponse.trim() }, {
                      onSuccess: () => { toast.success(t("toastReponse")); setRepondreAvisId(null); setReponse(""); },
                      onError: (e) => toast.error(e.message),
                    });
                  }
                }}
                disabled={!reponse.trim() || repondre.isPending}
              >
                <Send className="h-4 w-4 mr-2" />{t("envoyer")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog demande d'avis */}
      <Dialog open={showDemandeDialog} onOpenChange={setShowDemandeDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("demandeTitre")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("choisirClient")}</Label>
              <Select value={demandeClientId} onValueChange={setDemandeClientId}>
                <SelectTrigger><SelectValue placeholder={t("selClient")} /></SelectTrigger>
                <SelectContent>
                  {clients.filter((c) => c.email).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nom} ({c.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("demandeInfo")}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDemandeDialog(false)}>{t("annuler")}</Button>
              <Button
                onClick={() => {
                  if (demandeClientId) {
                    envoyerDemande.mutate({ clientId: parseInt(demandeClientId) }, {
                      onSuccess: () => { toast.success(t("toastDemande")); setShowDemandeDialog(false); setDemandeClientId(""); },
                      onError: (e) => toast.error(e.message),
                    });
                  }
                }}
                disabled={!demandeClientId || envoyerDemande.isPending}
              >
                <Send className="h-4 w-4 mr-2" />{envoyerDemande.isPending ? t("envoi") : t("envoyerDemande")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
