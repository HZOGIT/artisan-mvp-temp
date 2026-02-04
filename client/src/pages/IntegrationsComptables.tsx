import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Download, 
  Settings, 
  FileSpreadsheet, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Zap, 
  Play, 
  Pause, 
  History,
  ArrowUpDown,
  FileText,
  CreditCard,
  AlertTriangle,
  RotateCcw
} from "lucide-react";

export default function IntegrationsComptables() {
  const [exportForm, setExportForm] = useState({
    logiciel: "sage" as "sage" | "quickbooks" | "ciel" | "ebp" | "autre",
    formatExport: "fec" as "fec" | "iif" | "qbo" | "csv",
    dateDebut: "",
    dateFin: "",
  });

  const [configForm, setConfigForm] = useState({
    logiciel: "sage" as "sage" | "quickbooks" | "ciel" | "ebp" | "autre",
    formatExport: "fec" as "fec" | "iif" | "qbo" | "csv",
    compteVentes: "701000",
    compteTVACollectee: "445710",
    compteClients: "411000",
    compteAchats: "607000",
    compteTVADeductible: "445660",
    compteFournisseurs: "401000",
    compteBanque: "512000",
    compteCaisse: "530000",
    journalVentes: "VE",
    journalAchats: "AC",
    journalBanque: "BQ",
    prefixeFacture: "FA",
    prefixeAvoir: "AV",
    exerciceDebut: 1,
    actif: true,
  });

  const [syncConfig, setSyncConfig] = useState({
    syncAutoFactures: false,
    syncAutoPaiements: false,
    frequenceSync: "quotidien" as "quotidien" | "hebdomadaire" | "mensuel" | "manuel",
    heureSync: "02:00",
    notifierErreurs: true,
    notifierSucces: false,
  });

  const utils = trpc.useUtils();
  const { data: config } = trpc.integrationsComptables.getConfig.useQuery();
  const { data: exports, isLoading: exportsLoading } = trpc.integrationsComptables.getExports.useQuery();
  const { data: syncLogs } = trpc.integrationsComptables.getSyncLogs.useQuery();
  const { data: syncStatus } = trpc.integrationsComptables.getSyncStatus.useQuery();
  const { data: pendingItems } = trpc.integrationsComptables.getPendingItems.useQuery();

  // Charger la configuration de synchronisation
  useEffect(() => {
    if (config) {
      setSyncConfig({
        syncAutoFactures: config.syncAutoFactures || false,
        syncAutoPaiements: config.syncAutoPaiements || false,
        frequenceSync: (config.frequenceSync as any) || "quotidien",
        heureSync: config.heureSync || "02:00",
        notifierErreurs: config.notifierErreurs !== false,
        notifierSucces: config.notifierSucces || false,
      });
    }
  }, [config]);

  const saveConfigMutation = trpc.integrationsComptables.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuration sauvegardée");
      utils.integrationsComptables.getConfig.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const saveSyncConfigMutation = trpc.integrationsComptables.saveSyncConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuration de synchronisation sauvegardée");
      utils.integrationsComptables.getConfig.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const genererExportMutation = trpc.integrationsComptables.genererExport.useMutation({
    onSuccess: (data) => {
      toast.success("Export généré avec succès");
      utils.integrationsComptables.getExports.invalidate();
      
      const blob = new Blob([data.contenu], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${exportForm.logiciel}_${exportForm.formatExport}_${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const lancerSyncMutation = trpc.integrationsComptables.lancerSync.useMutation({
    onSuccess: (data) => {
      toast.success(`Synchronisation terminée: ${data.facturesSyncees} factures, ${data.paiementsSynces} paiements`);
      utils.integrationsComptables.getSyncLogs.invalidate();
      utils.integrationsComptables.getSyncStatus.invalidate();
      utils.integrationsComptables.getPendingItems.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const retrySyncMutation = trpc.integrationsComptables.retrySync.useMutation({
    onSuccess: () => {
      toast.success("Réessai de synchronisation lancé");
      utils.integrationsComptables.getSyncLogs.invalidate();
      utils.integrationsComptables.getPendingItems.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleExport = () => {
    if (!exportForm.dateDebut || !exportForm.dateFin) {
      toast.error("Veuillez sélectionner une période");
      return;
    }
    genererExportMutation.mutate(exportForm);
  };

  const getStatutBadge = (statut: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive"; icon: React.ReactNode; label: string }> = {
      en_cours: { variant: "secondary", icon: <RefreshCw className="h-3 w-3 animate-spin" />, label: "En cours" },
      termine: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, label: "Terminé" },
      succes: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, label: "Succès" },
      erreur: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" />, label: "Erreur" },
      en_attente: { variant: "secondary", icon: <Clock className="h-3 w-3" />, label: "En attente" },
    };
    const { variant, icon, label } = config[statut] || config.en_attente;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {label}
      </Badge>
    );
  };

  const logiciels = [
    { value: "sage", label: "Sage", formats: ["fec", "csv"] },
    { value: "quickbooks", label: "QuickBooks", formats: ["iif", "qbo", "csv"] },
    { value: "ciel", label: "Ciel Compta", formats: ["fec", "csv"] },
    { value: "ebp", label: "EBP", formats: ["fec", "csv"] },
    { value: "autre", label: "Autre", formats: ["fec", "csv"] },
  ];

  const formatsExport = [
    { value: "fec", label: "FEC (Fichier des Écritures Comptables)" },
    { value: "iif", label: "IIF (QuickBooks)" },
    { value: "qbo", label: "QBO (QuickBooks Online)" },
    { value: "csv", label: "CSV (Universel)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Intégrations Comptables</h1>
        <p className="text-muted-foreground">Synchronisez automatiquement vos données avec votre logiciel comptable</p>
      </div>

      {/* Statut de synchronisation */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${syncStatus?.actif ? "bg-green-100" : "bg-gray-100"}`}>
                {syncStatus?.actif ? (
                  <Play className="h-5 w-5 text-green-600" />
                ) : (
                  <Pause className="h-5 w-5 text-gray-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Statut</p>
                <p className="font-semibold">{syncStatus?.actif ? "Actif" : "Inactif"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Factures en attente</p>
                <p className="font-semibold">{pendingItems?.facturesEnAttente || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-100">
                <CreditCard className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paiements en attente</p>
                <p className="font-semibold">{pendingItems?.paiementsEnAttente || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-100">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Erreurs</p>
                <p className="font-semibold">{pendingItems?.erreurs || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sync">
        <TabsList>
          <TabsTrigger value="sync">
            <Zap className="h-4 w-4 mr-2" />
            Synchronisation
          </TabsTrigger>
          <TabsTrigger value="export">
            <Download className="h-4 w-4 mr-2" />
            Export Manuel
          </TabsTrigger>
          <TabsTrigger value="configuration">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="journal">
            <History className="h-4 w-4 mr-2" />
            Journal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-6">
          {/* Configuration de la synchronisation automatique */}
          <Card>
            <CardHeader>
              <CardTitle>Synchronisation automatique</CardTitle>
              <CardDescription>
                Configurez l'envoi automatique des factures et la réception des paiements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Synchroniser les factures</Label>
                      <p className="text-sm text-muted-foreground">
                        Envoyer automatiquement les nouvelles factures
                      </p>
                    </div>
                    <Switch
                      checked={syncConfig.syncAutoFactures}
                      onCheckedChange={(checked) =>
                        setSyncConfig({ ...syncConfig, syncAutoFactures: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Synchroniser les paiements</Label>
                      <p className="text-sm text-muted-foreground">
                        Récupérer les paiements reçus depuis le logiciel comptable
                      </p>
                    </div>
                    <Switch
                      checked={syncConfig.syncAutoPaiements}
                      onCheckedChange={(checked) =>
                        setSyncConfig({ ...syncConfig, syncAutoPaiements: checked })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Fréquence de synchronisation</Label>
                    <Select
                      value={syncConfig.frequenceSync}
                      onValueChange={(v: "quotidien" | "hebdomadaire" | "mensuel" | "manuel") =>
                        setSyncConfig({ ...syncConfig, frequenceSync: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quotidien">Quotidien</SelectItem>
                        <SelectItem value="hebdomadaire">Hebdomadaire</SelectItem>
                        <SelectItem value="mensuel">Mensuel</SelectItem>
                        <SelectItem value="manuel">Manuel uniquement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {syncConfig.frequenceSync !== "manuel" && (
                    <div className="space-y-2">
                      <Label>Heure de synchronisation</Label>
                      <Input
                        type="time"
                        value={syncConfig.heureSync}
                        onChange={(e) =>
                          setSyncConfig({ ...syncConfig, heureSync: e.target.value })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={syncConfig.notifierErreurs}
                    onCheckedChange={(checked) =>
                      setSyncConfig({ ...syncConfig, notifierErreurs: checked })
                    }
                  />
                  <Label>Notifier les erreurs</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={syncConfig.notifierSucces}
                    onCheckedChange={(checked) =>
                      setSyncConfig({ ...syncConfig, notifierSucces: checked })
                    }
                  />
                  <Label>Notifier les succès</Label>
                </div>
              </div>

              <div className="flex gap-4">
                <Button
                  onClick={() => saveSyncConfigMutation.mutate(syncConfig)}
                  disabled={saveSyncConfigMutation.isPending}
                >
                  {saveSyncConfigMutation.isPending ? "Sauvegarde..." : "Sauvegarder"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => lancerSyncMutation.mutate()}
                  disabled={lancerSyncMutation.isPending}
                >
                  {lancerSyncMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Synchronisation...
                    </>
                  ) : (
                    <>
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      Synchroniser maintenant
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Éléments en attente */}
          {(pendingItems?.facturesEnAttente || 0) + (pendingItems?.paiementsEnAttente || 0) + (pendingItems?.erreurs || 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Éléments en attente de synchronisation</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingItems?.items?.map((item: any) => (
                      <TableRow key={`${item.type}-${item.id}`}>
                        <TableCell>
                          <Badge variant="outline">
                            {item.type === "facture" ? "Facture" : "Paiement"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{item.reference}</TableCell>
                        <TableCell>
                          {item.date ? new Date(item.date).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>{parseFloat(item.montant || "0").toFixed(2)} €</TableCell>
                        <TableCell>{getStatutBadge(item.statut)}</TableCell>
                        <TableCell>
                          {item.statut === "erreur" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => retrySyncMutation.mutate({ type: item.type, id: item.id })}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!pendingItems?.items || pendingItems.items.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Aucun élément en attente
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Générer un export manuel</CardTitle>
              <CardDescription>
                Exportez vos écritures comptables vers votre logiciel
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Logiciel comptable</Label>
                  <Select
                    value={exportForm.logiciel}
                    onValueChange={(v: "sage" | "quickbooks" | "ciel" | "ebp" | "autre") =>
                      setExportForm({ ...exportForm, logiciel: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {logiciels.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Format d'export</Label>
                  <Select
                    value={exportForm.formatExport}
                    onValueChange={(v: "fec" | "iif" | "qbo" | "csv") =>
                      setExportForm({ ...exportForm, formatExport: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formatsExport.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date de début</Label>
                  <Input
                    type="date"
                    value={exportForm.dateDebut}
                    onChange={(e) => setExportForm({ ...exportForm, dateDebut: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin</Label>
                  <Input
                    type="date"
                    value={exportForm.dateFin}
                    onChange={(e) => setExportForm({ ...exportForm, dateFin: e.target.value })}
                  />
                </div>
              </div>

              <Button
                onClick={handleExport}
                disabled={genererExportMutation.isPending}
                className="w-full"
              >
                {genererExportMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Générer l'export
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Formats supportés</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg text-center">
                  <h4 className="font-semibold">FEC</h4>
                  <p className="text-sm text-muted-foreground">Sage, Ciel, EBP</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <h4 className="font-semibold">IIF</h4>
                  <p className="text-sm text-muted-foreground">QuickBooks Desktop</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <h4 className="font-semibold">QBO</h4>
                  <p className="text-sm text-muted-foreground">QuickBooks Online</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <h4 className="font-semibold">CSV</h4>
                  <p className="text-sm text-muted-foreground">Universel</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration comptable</CardTitle>
              <CardDescription>
                Paramétrez les comptes et journaux pour l'export
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Intégration active</Label>
                  <p className="text-sm text-muted-foreground">
                    Activer l'intégration comptable
                  </p>
                </div>
                <Switch
                  checked={configForm.actif}
                  onCheckedChange={(checked) =>
                    setConfigForm({ ...configForm, actif: checked })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Logiciel comptable</Label>
                  <Select
                    value={configForm.logiciel}
                    onValueChange={(v: "sage" | "quickbooks" | "ciel" | "ebp" | "autre") =>
                      setConfigForm({ ...configForm, logiciel: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {logiciels.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Format par défaut</Label>
                  <Select
                    value={configForm.formatExport}
                    onValueChange={(v: "fec" | "iif" | "qbo" | "csv") =>
                      setConfigForm({ ...configForm, formatExport: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formatsExport.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Comptes comptables - Ventes</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Ventes</Label>
                    <Input
                      value={configForm.compteVentes}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, compteVentes: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>TVA collectée</Label>
                    <Input
                      value={configForm.compteTVACollectee}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, compteTVACollectee: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Clients</Label>
                    <Input
                      value={configForm.compteClients}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, compteClients: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Comptes comptables - Achats</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Achats</Label>
                    <Input
                      value={configForm.compteAchats}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, compteAchats: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>TVA déductible</Label>
                    <Input
                      value={configForm.compteTVADeductible}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, compteTVADeductible: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fournisseurs</Label>
                    <Input
                      value={configForm.compteFournisseurs}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, compteFournisseurs: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Comptes de trésorerie</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Banque</Label>
                    <Input
                      value={configForm.compteBanque}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, compteBanque: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Caisse</Label>
                    <Input
                      value={configForm.compteCaisse}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, compteCaisse: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Journaux</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Journal ventes</Label>
                    <Input
                      value={configForm.journalVentes}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, journalVentes: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Journal achats</Label>
                    <Input
                      value={configForm.journalAchats}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, journalAchats: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Journal banque</Label>
                    <Input
                      value={configForm.journalBanque}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, journalBanque: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={() => saveConfigMutation.mutate(configForm)}
                disabled={saveConfigMutation.isPending}
              >
                {saveConfigMutation.isPending ? "Sauvegarde..." : "Sauvegarder la configuration"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journal">
          <Card>
            <CardHeader>
              <CardTitle>Journal de synchronisation</CardTitle>
              <CardDescription>
                Historique des synchronisations et exports
              </CardDescription>
            </CardHeader>
            <CardContent>
              {exportsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Logiciel</TableHead>
                      <TableHead>Détails</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs?.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.type}</Badge>
                        </TableCell>
                        <TableCell>{log.logiciel?.toUpperCase()}</TableCell>
                        <TableCell>
                          {log.type === "export" ? (
                            <span>{log.nombreEcritures || 0} écritures</span>
                          ) : (
                            <span>
                              {log.facturesSyncees || 0} factures, {log.paiementsSynces || 0} paiements
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{getStatutBadge(log.statut)}</TableCell>
                      </TableRow>
                    ))}
                    {exports?.map((exp: any) => (
                      <TableRow key={`export-${exp.id}`}>
                        <TableCell>
                          {exp.createdAt ? new Date(exp.createdAt).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">Export</Badge>
                        </TableCell>
                        <TableCell>{exp.logiciel?.toUpperCase()}</TableCell>
                        <TableCell>
                          {exp.nombreEcritures || 0} écritures ({exp.formatExport?.toUpperCase()})
                        </TableCell>
                        <TableCell>{getStatutBadge(exp.statut || "termine")}</TableCell>
                      </TableRow>
                    ))}
                    {(!syncLogs || syncLogs.length === 0) && (!exports || exports.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Aucun historique disponible
                        </TableCell>
                      </TableRow>
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
