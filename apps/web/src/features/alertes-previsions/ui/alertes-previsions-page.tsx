import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, AlertTriangle, TrendingUp, TrendingDown, Settings, History, Play } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Badge } from "@/shared/ui/badge";
import { useAlertesPrevisions } from "../application/use-alertes-previsions";
import { FREQUENCES, isAlertePositive, formatMontant, formatDateHeure, canalHasEmail, canalHasSms, type AlertesForm, type Frequence } from "../domain/alertes-previsions";

// Page `alertes-previsions` (alertes écarts de CA) — migration clean-archi de `pages/AlertesPrevisions.tsx`.
// Markup à l'identique. tRPC encapsulé dans `use-alertes-previsions`, helpers purs en domain.
const EMPTY: AlertesForm = {
  seuilAlertePositif: "10", seuilAlerteNegatif: "10", alerteEmail: true, alerteSms: false,
  emailDestination: "", telephoneDestination: "", frequenceVerification: "hebdomadaire", actif: true,
};

export default function AlertesPrevisionsPage() {
  const { t } = useTranslation("alertesPrevisions");
  const { config, historique, save, verifier } = useAlertesPrevisions();
  const [formData, setFormData] = useState<AlertesForm>(EMPTY);

  useEffect(() => {
    if (!config) return;
    setFormData({
      seuilAlertePositif: config.seuilAlertePositif || "10",
      seuilAlerteNegatif: config.seuilAlerteNegatif || "10",
      alerteEmail: config.alerteEmail ?? true,
      alerteSms: config.alerteSms ?? false,
      emailDestination: config.emailDestination || "",
      telephoneDestination: config.telephoneDestination || "",
      frequenceVerification: config.frequenceVerification || "hebdomadaire",
      actif: config.actif ?? true,
    });
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(formData, { onSuccess: () => toast.success(t("toastSauvegarde")) });
  };

  const handleVerifier = () => {
    verifier.mutate(undefined, {
      onSuccess: (alertes) => alertes.length > 0 ? toast.success(t("toastAlertes", { count: alertes.length })) : toast.info(t("toastAucunEcart")),
    });
  };

  const TypeBadge = ({ type }: { type: string }) =>
    isAlertePositive(type) ? (
      <Badge className="bg-green-500"><TrendingUp className="h-3 w-3 mr-1" />{t("positif")}</Badge>
    ) : (
      <Badge className="bg-red-500"><TrendingDown className="h-3 w-3 mr-1" />{t("negatif")}</Badge>
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t("titre")}</h1>
          <p className="text-muted-foreground">{t("sousTitre")}</p>
        </div>
        <Button onClick={handleVerifier} disabled={verifier.isPending}>
          <Play className="h-4 w-4 mr-2" />{t("verifierMaintenant")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />{t("configuration")}</CardTitle>
            <CardDescription>{t("configurationDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t("alertesActivees")}</Label>
                  <p className="text-sm text-muted-foreground">{t("alertesActiveesDesc")}</p>
                </div>
                <Switch checked={formData.actif} onCheckedChange={(v) => setFormData({ ...formData, actif: v })} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-500" />{t("seuilPositif")}</Label>
                  <Input type="number" value={formData.seuilAlertePositif} onChange={(e) => setFormData({ ...formData, seuilAlertePositif: e.target.value })} placeholder="10" />
                  <p className="text-xs text-muted-foreground mt-1">{t("seuilPositifDesc")}</p>
                </div>
                <div>
                  <Label className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" />{t("seuilNegatif")}</Label>
                  <Input type="number" value={formData.seuilAlerteNegatif} onChange={(e) => setFormData({ ...formData, seuilAlerteNegatif: e.target.value })} placeholder="10" />
                  <p className="text-xs text-muted-foreground mt-1">{t("seuilNegatifDesc")}</p>
                </div>
              </div>

              <div>
                <Label>{t("frequence")}</Label>
                <Select value={formData.frequenceVerification} onValueChange={(v) => setFormData({ ...formData, frequenceVerification: v as Frequence })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCES.map((f) => (<SelectItem key={f} value={f}>{t(`frequenceOption.${f}`)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <Label>{t("canaux")}</Label>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-medium">{t("email")}</p>
                      <p className="text-sm text-muted-foreground">{t("emailDesc")}</p>
                    </div>
                  </div>
                  <Switch checked={formData.alerteEmail} onCheckedChange={(v) => setFormData({ ...formData, alerteEmail: v })} />
                </div>
                {formData.alerteEmail && (
                  <Input type="email" value={formData.emailDestination} onChange={(e) => setFormData({ ...formData, emailDestination: e.target.value })} placeholder={t("emailPlaceholder")} />
                )}

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">{t("sms")}</p>
                      <p className="text-sm text-muted-foreground">{t("smsDesc")}</p>
                    </div>
                  </div>
                  <Switch checked={formData.alerteSms} onCheckedChange={(v) => setFormData({ ...formData, alerteSms: v })} />
                </div>
                {formData.alerteSms && (
                  <Input type="tel" value={formData.telephoneDestination} onChange={(e) => setFormData({ ...formData, telephoneDestination: e.target.value })} placeholder={t("smsPlaceholder")} />
                )}
              </div>

              <Button type="submit" className="w-full" disabled={save.isPending}>{t("sauvegarder")}</Button>
            </form>
          </CardContent>
        </Card>

        {/* Historique */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />{t("historique")}</CardTitle>
            <CardDescription>{t("historiqueDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {historique.map((alerte) => (
                <div key={alerte.id} className="flex items-start gap-4 p-3 border rounded-lg">
                  <div className="p-2 bg-yellow-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-yellow-600" /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <TypeBadge type={alerte.typeAlerte} />
                      <span className="text-sm text-muted-foreground">{formatDateHeure(alerte.dateEnvoi)}</span>
                    </div>
                    <p className="text-sm">{alerte.message}</p>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{t("prevu", { montant: formatMontant(alerte.caPrevisionnel) })}</span>
                      <span>{t("reel", { montant: formatMontant(alerte.caRealise) })}</span>
                      <span>{t("ecart", { pct: alerte.ecartPourcentage })}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {canalHasEmail(alerte.canalEnvoi) && <Badge variant="outline" className="text-xs"><Mail className="h-3 w-3 mr-1" />{t("emailEnvoye")}</Badge>}
                      {canalHasSms(alerte.canalEnvoi) && <Badge variant="outline" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />{t("smsEnvoye")}</Badge>}
                    </div>
                  </div>
                </div>
              ))}
              {historique.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t("aucune")}</p>
                  <p className="text-sm">{t("aucuneAstuce")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
