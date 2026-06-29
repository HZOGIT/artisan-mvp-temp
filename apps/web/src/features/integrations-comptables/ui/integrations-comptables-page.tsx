import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Settings, CheckCircle2, Clock, AlertCircle, RefreshCw, Zap, Play, Pause, History, ArrowUpDown, FileText, CreditCard, AlertTriangle, RotateCcw, Lock, Unlock } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Badge } from "@/shared/ui/badge";
import { Switch } from "@/shared/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { useIntegrationsComptables } from "../application/use-integrations-comptables";
import { DEFAULT_CONFIG_FORM, DEFAULT_SYNC_CONFIG, defaultExportForm, syncConfigFromConfig, statutVariant, pendingTotal, exportFilename, LOGICIELS, FORMATS, FREQUENCES, REGIMES_TVA, type Logiciel, type FormatExport, type FrequenceSync, type RegimeTVA } from "../domain/integrations-comptables";

/*
 * Page `integrations-comptables` — migration clean-archi de `pages/IntegrationsComptables.tsx`. Markup à
 * l'identique (journal unifié sur le vrai contrat : détail = nombreEcritures, cf. finding). 0 `any`.
 */
const STATUT_ICON: Record<string, typeof CheckCircle2> = { en_cours: RefreshCw, termine: CheckCircle2, succes: CheckCircle2, erreur: AlertCircle, en_attente: Clock };

export default function IntegrationsComptablesPage() {
  const { t } = useTranslation("integrationsComptables");
  const { config, lockDate, exports, syncLogs, syncStatus, pendingItems, exportsLoading, saveConfig, saveSyncConfig, genererExport, lancerSync, retrySync, verrouillerCompta } = useIntegrationsComptables();
  const [exportForm, setExportForm] = useState(defaultExportForm);
  const [configForm, setConfigForm] = useState(DEFAULT_CONFIG_FORM);
  const [syncConfig, setSyncConfig] = useState(DEFAULT_SYNC_CONFIG);
  const [lockDateInput, setLockDateInput] = useState("");

  useEffect(() => { if (config) setSyncConfig(syncConfigFromConfig(config)); }, [config]);

  const StatutBadge = ({ statut: s }: { statut: string }) => {
    const Icon = STATUT_ICON[s] ?? Clock;
    return <Badge variant={statutVariant(s)} className="flex items-center gap-1"><Icon className={`h-3 w-3 ${s === "en_cours" ? "animate-spin" : ""}`} />{t(`statutLabel.${s}`, s)}</Badge>;
  };

  const handleExport = () => {
    if (!exportForm.dateDebut || !exportForm.dateFin) { toast.error(t("errPeriode")); return; }
    genererExport.mutate(exportForm, {
      onSuccess: (data) => {
        toast.success(t("toastExport"));
        const blob = new Blob([data.contenu], { type: "text/plain" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = exportFilename(exportForm.logiciel, exportForm.formatExport);
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
        <p className="text-muted-foreground">{t("sousTitre")}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${syncStatus?.actif ? "bg-green-100" : "bg-gray-100"}`}>{syncStatus?.actif ? <Play className="h-5 w-5 text-green-600" /> : <Pause className="h-5 w-5 text-gray-600" />}</div>
          <div><p className="text-sm text-muted-foreground">{t("statut")}</p><p className="font-semibold">{syncStatus?.actif ? t("actif") : t("inactif")}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-blue-100"><FileText className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-sm text-muted-foreground">{t("facturesEnAttente")}</p><p className="font-semibold">{pendingItems?.facturesEnAttente || 0}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-purple-100"><CreditCard className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-sm text-muted-foreground">{t("paiementsEnAttente")}</p><p className="font-semibold">{pendingItems?.paiementsEnAttente || 0}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-orange-100"><AlertTriangle className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-sm text-muted-foreground">{t("erreurs")}</p><p className="font-semibold">{pendingItems?.erreurs || 0}</p></div>
        </div></CardContent></Card>
      </div>

      <Tabs defaultValue="sync">
        <TabsList>
          <TabsTrigger value="sync"><Zap className="h-4 w-4 mr-2" />{t("tabSync")}</TabsTrigger>
          <TabsTrigger value="export"><Download className="h-4 w-4 mr-2" />{t("tabExport")}</TabsTrigger>
          <TabsTrigger value="configuration"><Settings className="h-4 w-4 mr-2" />{t("tabConfig")}</TabsTrigger>
          <TabsTrigger value="journal"><History className="h-4 w-4 mr-2" />{t("tabJournal")}</TabsTrigger>
        </TabsList>

        {/* Tab Synchronisation */}
        <TabsContent value="sync" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("syncAutoTitre")}</CardTitle>
              <CardDescription>{t("syncAutoDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div><Label>{t("syncFactures")}</Label><p className="text-sm text-muted-foreground">{t("syncFacturesDesc")}</p></div>
                    <Switch checked={syncConfig.syncAutoFactures} onCheckedChange={(c) => setSyncConfig({ ...syncConfig, syncAutoFactures: c })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div><Label>{t("syncPaiements")}</Label><p className="text-sm text-muted-foreground">{t("syncPaiementsDesc")}</p></div>
                    <Switch checked={syncConfig.syncAutoPaiements} onCheckedChange={(c) => setSyncConfig({ ...syncConfig, syncAutoPaiements: c })} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("frequence")}</Label>
                    <Select value={syncConfig.frequenceSync} onValueChange={(v) => setSyncConfig({ ...syncConfig, frequenceSync: v as FrequenceSync })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FREQUENCES.map((f) => (<SelectItem key={f} value={f}>{t(`freqLabel.${f}`)}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  {syncConfig.frequenceSync !== "manuel" && (
                    <div className="space-y-2">
                      <Label>{t("heure")}</Label>
                      <Input type="time" value={syncConfig.heureSync} onChange={(e) => setSyncConfig({ ...syncConfig, heureSync: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-2"><Switch checked={syncConfig.notifierErreurs} onCheckedChange={(c) => setSyncConfig({ ...syncConfig, notifierErreurs: c })} /><Label>{t("notifierErreurs")}</Label></div>
                <div className="flex items-center gap-2"><Switch checked={syncConfig.notifierSucces} onCheckedChange={(c) => setSyncConfig({ ...syncConfig, notifierSucces: c })} /><Label>{t("notifierSucces")}</Label></div>
              </div>
              <div className="flex gap-4">
                <Button onClick={() => saveSyncConfig.mutate(syncConfig, { onSuccess: () => toast.success(t("toastSyncConfig")), onError: (e) => toast.error(e.message) })} disabled={saveSyncConfig.isPending}>
                  {saveSyncConfig.isPending ? t("sauvegarde") : t("sauvegarder")}
                </Button>
                <Button variant="outline" onClick={() => lancerSync.mutate(undefined, { onSuccess: (data) => toast.success(data.message), onError: (e) => toast.error(e.message) })} disabled={lancerSync.isPending}>
                  {lancerSync.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t("synchronisation")}</> : <><ArrowUpDown className="h-4 w-4 mr-2" />{t("synchroniserMaintenant")}</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {pendingTotal(pendingItems) > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("elementsAttenteTitre")}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colType")}</TableHead><TableHead>{t("colReference")}</TableHead><TableHead>{t("colDate")}</TableHead>
                      <TableHead>{t("colMontant")}</TableHead><TableHead>{t("colStatut")}</TableHead><TableHead>{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingItems?.items?.map((item) => (
                      <TableRow key={`facture-${item.id}`}>
                        <TableCell><Badge variant="outline">{t("facture")}</Badge></TableCell>
                        <TableCell className="font-medium">{item.numero}</TableCell>
                        <TableCell>{item.dateFacture ? new Date(item.dateFacture).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>{parseFloat(item.totalTTC || "0").toFixed(2)} €</TableCell>
                        <TableCell><StatutBadge statut={item.statut || "en_attente"} /></TableCell>
                        <TableCell>{item.statut === "erreur" && <Button variant="ghost" size="sm" onClick={() => retrySync.mutate({ type: "facture", id: item.id }, { onSuccess: () => toast.success(t("toastRetry")), onError: (e) => toast.error(e.message) })}><RotateCcw className="h-4 w-4" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                    {(!pendingItems?.items || pendingItems.items.length === 0) && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("aucunElement")}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab Export */}
        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("exportTitre")}</CardTitle><CardDescription>{t("exportDesc")}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("logiciel")}</Label>
                  <Select value={exportForm.logiciel} onValueChange={(v) => setExportForm({ ...exportForm, logiciel: v as Logiciel })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LOGICIELS.map((l) => (<SelectItem key={l} value={l}>{t(`logicielLabel.${l}`)}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("format")}</Label>
                  <Select value={exportForm.formatExport} onValueChange={(v) => setExportForm({ ...exportForm, formatExport: v as FormatExport })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FORMATS.map((f) => (<SelectItem key={f} value={f}>{t(`formatLabel.${f}`)}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t("dateDebut")}</Label><Input type="date" value={exportForm.dateDebut} onChange={(e) => setExportForm({ ...exportForm, dateDebut: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("dateFin")}</Label><Input type="date" value={exportForm.dateFin} onChange={(e) => setExportForm({ ...exportForm, dateFin: e.target.value })} /></div>
              </div>
              <Button onClick={handleExport} disabled={genererExport.isPending} className="w-full">
                {genererExport.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t("generationEnCours")}</> : <><Download className="h-4 w-4 mr-2" />{t("genererExport")}</>}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("formatsSupportes")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {FORMATS.map((f) => (
                  <div key={f} className="p-4 border rounded-lg text-center">
                    <h4 className="font-semibold">{f.toUpperCase()}</h4>
                    <p className="text-sm text-muted-foreground">{t(`formatDescr.${f}`)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Configuration */}
        <TabsContent value="configuration" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("configTitre")}</CardTitle><CardDescription>{t("configDesc")}</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div><Label>{t("integrationActive")}</Label><p className="text-sm text-muted-foreground">{t("integrationActiveDesc")}</p></div>
                <Switch checked={configForm.actif} onCheckedChange={(c) => setConfigForm({ ...configForm, actif: c })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("logiciel")}</Label>
                  <Select value={configForm.logiciel} onValueChange={(v) => setConfigForm({ ...configForm, logiciel: v as Logiciel })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LOGICIELS.map((l) => (<SelectItem key={l} value={l}>{t(`logicielLabel.${l}`)}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("formatDefaut")}</Label>
                  <Select value={configForm.formatExport} onValueChange={(v) => setConfigForm({ ...configForm, formatExport: v as FormatExport })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FORMATS.map((f) => (<SelectItem key={f} value={f}>{t(`formatLabel.${f}`)}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("regimeTVATitre")}</Label>
                <Select value={configForm.regimeTVA} onValueChange={(v) => setConfigForm({ ...configForm, regimeTVA: v as RegimeTVA })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REGIMES_TVA.map((r) => (<SelectItem key={r} value={r}>{t(`regimeTVALabel.${r}`)}</SelectItem>))}</SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">{t(`regimeTVADesc.${configForm.regimeTVA}`)}</p>
                {configForm.regimeTVA === "encaissements" && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{t("mentionTVAEncaissements")}</p>
                )}
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t("comptesVentes")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>{t("ventes")}</Label><Input value={configForm.compteVentes} onChange={(e) => setConfigForm({ ...configForm, compteVentes: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("tvaCollectee")}</Label><Input value={configForm.compteTVACollectee} onChange={(e) => setConfigForm({ ...configForm, compteTVACollectee: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("clients")}</Label><Input value={configForm.compteClients} onChange={(e) => setConfigForm({ ...configForm, compteClients: e.target.value })} /></div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t("comptesAchats")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>{t("achats")}</Label><Input value={configForm.compteAchats} onChange={(e) => setConfigForm({ ...configForm, compteAchats: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("tvaDeductible")}</Label><Input value={configForm.compteTVADeductible} onChange={(e) => setConfigForm({ ...configForm, compteTVADeductible: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("fournisseurs")}</Label><Input value={configForm.compteFournisseurs} onChange={(e) => setConfigForm({ ...configForm, compteFournisseurs: e.target.value })} /></div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t("comptesTresorerie")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t("banque")}</Label><Input value={configForm.compteBanque} onChange={(e) => setConfigForm({ ...configForm, compteBanque: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("caisse")}</Label><Input value={configForm.compteCaisse} onChange={(e) => setConfigForm({ ...configForm, compteCaisse: e.target.value })} /></div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t("journaux")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>{t("journalVentes")}</Label><Input value={configForm.journalVentes} onChange={(e) => setConfigForm({ ...configForm, journalVentes: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("journalAchats")}</Label><Input value={configForm.journalAchats} onChange={(e) => setConfigForm({ ...configForm, journalAchats: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t("journalBanque")}</Label><Input value={configForm.journalBanque} onChange={(e) => setConfigForm({ ...configForm, journalBanque: e.target.value })} /></div>
                </div>
              </div>
              <Button onClick={() => saveConfig.mutate(configForm, { onSuccess: () => toast.success(t("toastConfig")), onError: (e) => toast.error(e.message) })} disabled={saveConfig.isPending}>
                {saveConfig.isPending ? t("sauvegarde") : t("sauvegarderConfig")}
              </Button>
            </CardContent>
          </Card>

          {/* Verrouillage comptable */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />{t("verrouillageTitre")}</CardTitle>
              <CardDescription>{t("verrouillageDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {lockDate && (
                <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>{t("periodeVerrouilleeJusquau", { date: lockDate })}</span>
                  <Button size="sm" variant="outline" className="ml-auto" disabled={verrouillerCompta.isPending}
                    onClick={() => verrouillerCompta.mutate({ date: null }, { onSuccess: () => toast.success(t("toastDeverrouille")), onError: (e) => toast.error(e.message) })}>
                    <Unlock className="h-4 w-4 mr-1" />{t("deverrouiller")}
                  </Button>
                </div>
              )}
              <div className="flex items-end gap-3">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="lock-date-input">{t("verrouillerJusquau")}</Label>
                  <Input id="lock-date-input" type="date" value={lockDateInput} onChange={(e) => setLockDateInput(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                </div>
                <Button disabled={!lockDateInput || verrouillerCompta.isPending}
                  onClick={() => verrouillerCompta.mutate({ date: lockDateInput }, { onSuccess: () => { toast.success(t("toastVerrouille", { date: lockDateInput })); setLockDateInput(""); }, onError: (e) => toast.error(e.message) })}>
                  <Lock className="h-4 w-4 mr-2" />{t("verrouiller")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("verrouillageExplication")}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Journal */}
        <TabsContent value="journal">
          <Card>
            <CardHeader><CardTitle>{t("journalTitre")}</CardTitle><CardDescription>{t("journalDesc")}</CardDescription></CardHeader>
            <CardContent>
              {exportsLoading ? (
                <div className="flex items-center justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colDate")}</TableHead><TableHead>{t("colType")}</TableHead><TableHead>{t("colLogiciel")}</TableHead><TableHead>{t("colDetails")}</TableHead><TableHead>{t("colStatut")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.map((log) => (
                      <TableRow key={`sync-${log.id}`}>
                        <TableCell>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</TableCell>
                        <TableCell><Badge variant="outline">{t("typeSync")}</Badge></TableCell>
                        <TableCell>{log.logiciel?.toUpperCase()}</TableCell>
                        <TableCell>{t("nbEcritures", { n: log.nombreEcritures || 0 })}</TableCell>
                        <TableCell><StatutBadge statut={log.statut || "termine"} /></TableCell>
                      </TableRow>
                    ))}
                    {exports.map((exp) => (
                      <TableRow key={`export-${exp.id}`}>
                        <TableCell>{exp.createdAt ? new Date(exp.createdAt).toLocaleString() : "-"}</TableCell>
                        <TableCell><Badge variant="outline">{t("typeExport")}</Badge></TableCell>
                        <TableCell>{exp.logiciel?.toUpperCase()}</TableCell>
                        <TableCell>{t("nbEcrituresFormat", { n: exp.nombreEcritures || 0, format: exp.formatExport?.toUpperCase() })}</TableCell>
                        <TableCell><StatutBadge statut={exp.statut || "termine"} /></TableCell>
                      </TableRow>
                    ))}
                    {syncLogs.length === 0 && exports.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("aucunHistorique")}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
