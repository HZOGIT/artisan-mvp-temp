import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2, Mail, FileText, Send, RefreshCw, AlertCircle, CheckCircle, Settings, Power, Calendar,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Badge } from "@/modern/shared/ui/badge";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Textarea } from "@/modern/shared/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/modern/shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Switch } from "@/modern/shared/ui/switch";
import { useRelancesDevis } from "../application/use-relances-devis";
import {
  formatCurrency, partitionByEmail, defaultRelanceMessage, toggleJourEnvoi, JOURS_SEMAINE,
  type DevisNonSigne,
} from "../domain/relance-devis";

const JOURS_OPTIONS = [3, 7, 14, 30] as const;

export default function RelancesDevisPage() {
  const { t } = useTranslation("relancesDevis");
  const [joursMinimum, setJoursMinimum] = useState(7);
  const { devisNonSignes, isLoading, envoyerRelance, envoyerRelancesAuto } = useRelancesDevis(joursMinimum);

  const [selectedDevis, setSelectedDevis] = useState<DevisNonSigne | null>(null);
  const [messageRelance, setMessageRelance] = useState("");
  const [showRelanceDialog, setShowRelanceDialog] = useState(false);
  const [showAutoDialog, setShowAutoDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [joursEntreRelances, setJoursEntreRelances] = useState(7);
  const [configRelance, setConfigRelance] = useState({
    actif: false,
    joursApresEnvoi: 7,
    joursEntreRelances: 7,
    nombreMaxRelances: 3,
    heureEnvoi: "09:00",
    joursEnvoi: "1,2,3,4,5",
  });

  const { avecEmail: devisAvecEmail, sansEmail: devisSansEmail } = partitionByEmail(devisNonSignes);

  const handleRelance = (item: DevisNonSigne) => {
    setSelectedDevis(item);
    setMessageRelance(defaultRelanceMessage(item.devis.numero, formatCurrency(item.devis.totalTTC)));
    setShowRelanceDialog(true);
  };

  const confirmRelance = () => {
    if (!selectedDevis) return;
    envoyerRelance.mutate(
      { devisId: selectedDevis.devis.id, message: messageRelance },
      {
        onSuccess: () => {
          toast.success(t("toastRelanceEnvoyee"));
          setShowRelanceDialog(false);
          setSelectedDevis(null);
          setMessageRelance("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleRelancesAuto = () => {
    envoyerRelancesAuto.mutate(
      { joursMinimum, joursEntreRelances },
      {
        onSuccess: (data) => {
          toast.success(t("toastRelancesAuto", { count: data.relancesEnvoyees }));
          setShowAutoDialog(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowConfigDialog(true)}>
            <Settings className="mr-2 h-4 w-4" />
            {t("configAuto")}
          </Button>
          <Button variant="outline" onClick={() => setShowAutoDialog(true)} disabled={devisAvecEmail.length === 0}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("relancesManuelles")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("filtres")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="joursMinimum">{t("devisDePlusDe")}</Label>
              <Select value={joursMinimum.toString()} onValueChange={(v) => setJoursMinimum(parseInt(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOURS_OPTIONS.map((j) => (
                    <SelectItem key={j} value={j.toString()}>{t("jours", { count: j })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("statDevisEnAttente")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devisNonSignes.length}</div>
            <p className="text-xs text-muted-foreground">{t("statDepuisPlusDe", { count: joursMinimum })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("statRelancables")}</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devisAvecEmail.length}</div>
            <p className="text-xs text-muted-foreground">{t("statClientsAvecEmail")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("statSansEmail")}</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devisSansEmail.length}</div>
            <p className="text-xs text-muted-foreground">{t("statRelanceManuelle")}</p>
          </CardContent>
        </Card>
      </div>

      {devisNonSignes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-medium">{t("aucunTitre")}</h3>
            <p className="text-muted-foreground text-center mt-2">{t("aucunTexte")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("devisARelancer")}</CardTitle>
            <CardDescription>{t("devisARelancerDesc", { count: devisNonSignes.length, jours: joursMinimum })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 font-medium whitespace-nowrap">{t("colDevis")}</th>
                    <th className="text-left p-2 font-medium">{t("colClient")}</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">{t("colMontant")}</th>
                    <th className="text-center p-2 font-medium whitespace-nowrap">{t("colStatut")}</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {devisNonSignes.map((item) => (
                    <tr key={item.devis.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">
                        <a href={`/devis/${item.devis.id}`} className="hover:underline">
                          <span className="font-medium">{item.devis.numero}</span>
                        </a>
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{item.client?.nom || t("clientInconnu")}</div>
                      </td>
                      <td className="p-2 text-right font-medium whitespace-nowrap">{formatCurrency(item.devis.totalTTC)}</td>
                      <td className="p-2 text-center whitespace-nowrap">
                        {item.signature ? (
                          <Badge variant="outline">{t("lienEnvoye")}</Badge>
                        ) : (
                          <Badge variant="secondary">{t("enAttente")}</Badge>
                        )}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          {item.client?.email ? (
                            <Button size="sm" onClick={() => handleRelance(item)}>
                              <Send className="mr-2 h-4 w-4" />
                              {t("relancer")}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              <AlertCircle className="mr-2 h-4 w-4" />
                              {t("pasDEmail")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showRelanceDialog} onOpenChange={setShowRelanceDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("envoyerRelanceTitre")}</DialogTitle>
            <DialogDescription>
              {t("envoyerRelanceDesc", { numero: selectedDevis?.devis.numero ?? "", client: selectedDevis?.client?.nom ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("destinataire")}</Label>
              <Input value={selectedDevis?.client?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">{t("message")}</Label>
              <Textarea id="message" value={messageRelance} onChange={(e) => setMessageRelance(e.target.value)} rows={8} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRelanceDialog(false)}>{t("annuler")}</Button>
            <Button onClick={confirmRelance} disabled={envoyerRelance.isPending}>
              {envoyerRelance.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("envoi")}</>
              ) : (
                <><Send className="mr-2 h-4 w-4" />{t("envoyerLaRelance")}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAutoDialog} onOpenChange={setShowAutoDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("relancesAutoTitre")}</DialogTitle>
            <DialogDescription>{t("relancesAutoDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("devisDePlusDe")}</Label>
              <Select value={joursMinimum.toString()} onValueChange={(v) => setJoursMinimum(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOURS_OPTIONS.map((j) => (
                    <SelectItem key={j} value={j.toString()}>{t("jours", { count: j })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("delaiMinEntreRelances")}</Label>
              <Select value={joursEntreRelances.toString()} onValueChange={(v) => setJoursEntreRelances(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 7, 14].map((j) => (
                    <SelectItem key={j} value={j.toString()}>{t("jours", { count: j })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("delaiMinHint")}</p>
            </div>
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm">{t("devisPotentiels", { count: devisAvecEmail.length })}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoDialog(false)}>{t("annuler")}</Button>
            <Button onClick={handleRelancesAuto} disabled={envoyerRelancesAuto.isPending}>
              {envoyerRelancesAuto.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("envoi")}</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" />{t("lancerLesRelances")}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t("configTitre")}
            </DialogTitle>
            <DialogDescription>{t("configDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Power className={`h-5 w-5 ${configRelance.actif ? "text-green-500" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-medium">{t("relancesAutomatiques")}</p>
                  <p className="text-sm text-muted-foreground">{configRelance.actif ? t("activees") : t("desactivees")}</p>
                </div>
              </div>
              <Switch checked={configRelance.actif} onCheckedChange={(checked) => setConfigRelance({ ...configRelance, actif: checked })} />
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("delaiApresEnvoi")}</Label>
                  <Select value={configRelance.joursApresEnvoi.toString()} onValueChange={(v) => setConfigRelance({ ...configRelance, joursApresEnvoi: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 5, 7, 10, 14].map((j) => (
                        <SelectItem key={j} value={j.toString()}>{t("jours", { count: j })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("avantPremiereRelance")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("entreLesRelances")}</Label>
                  <Select value={configRelance.joursEntreRelances.toString()} onValueChange={(v) => setConfigRelance({ ...configRelance, joursEntreRelances: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 5, 7, 10].map((j) => (
                        <SelectItem key={j} value={j.toString()}>{t("jours", { count: j })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("nombreMaxRelances")}</Label>
                  <Select value={configRelance.nombreMaxRelances.toString()} onValueChange={(v) => setConfigRelance({ ...configRelance, nombreMaxRelances: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 5].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n > 1 ? t("relancesCount", { count: n }) : t("relanceCount", { count: n })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("heureEnvoi")}</Label>
                  <Select value={configRelance.heureEnvoi} onValueChange={(v) => setConfigRelance({ ...configRelance, heureEnvoi: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["08:00", "09:00", "10:00", "14:00", "16:00"].map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {t("joursEnvoi")}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {JOURS_SEMAINE.map((jour, index) => {
                    const jourNum = (index + 1).toString();
                    const isSelected = configRelance.joursEnvoi.includes(jourNum);
                    return (
                      <Button
                        key={jour}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => setConfigRelance({ ...configRelance, joursEnvoi: toggleJourEnvoi(configRelance.joursEnvoi, jourNum) })}
                      >
                        {jour}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            {configRelance.actif && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">
                  <CheckCircle className="inline h-4 w-4 mr-1" />
                  {t("configResume", {
                    max: configRelance.nombreMaxRelances,
                    apres: configRelance.joursApresEnvoi,
                    entre: configRelance.joursEntreRelances,
                    heure: configRelance.heureEnvoi,
                  })}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>{t("annuler")}</Button>
            <Button onClick={() => {
              toast.success(configRelance.actif ? t("toastConfigActivee") : t("toastConfigDesactivee"));
              setShowConfigDialog(false);
            }}>
              {t("enregistrer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
