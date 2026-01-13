import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Download, Settings, FileSpreadsheet, CheckCircle2, Clock, AlertCircle, RefreshCw } from "lucide-react";

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

  const utils = trpc.useUtils();
  const { data: config } = trpc.integrationsComptables.getConfig.useQuery();
  const { data: exports, isLoading: exportsLoading } = trpc.integrationsComptables.getExports.useQuery();

  const saveConfigMutation = trpc.integrationsComptables.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuration sauvegardée");
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
      
      // Télécharger le fichier
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

  const handleExport = () => {
    if (!exportForm.dateDebut || !exportForm.dateFin) {
      toast.error("Veuillez sélectionner une période");
      return;
    }
    genererExportMutation.mutate(exportForm);
  };

  const getStatutBadge = (statut: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive"; icon: React.ReactNode }> = {
      en_cours: { variant: "secondary", icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
      termine: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
      erreur: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" /> },
    };
    const { variant, icon } = config[statut] || config.en_cours;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {statut}
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
        <p className="text-muted-foreground">Exportez vos données vers votre logiciel comptable</p>
      </div>

      <Tabs defaultValue="export">
        <TabsList>
          <TabsTrigger value="export">
            <Download className="h-4 w-4 mr-2" />
            Export
          </TabsTrigger>
          <TabsTrigger value="configuration">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="historique">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Générer un export</CardTitle>
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
                    Activer l'export automatique des écritures
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
                  <Label>Logiciel par défaut</Label>
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
                  <Label>Mois de début d'exercice</Label>
                  <Select
                    value={configForm.exerciceDebut.toString()}
                    onValueChange={(v) =>
                      setConfigForm({ ...configForm, exerciceDebut: parseInt(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {new Date(2024, i, 1).toLocaleDateString("fr-FR", { month: "long" })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Comptes de ventes</h4>
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
                <h4 className="font-semibold mb-4">Comptes d'achats</h4>
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

        <TabsContent value="historique">
          <Card>
            <CardHeader>
              <CardTitle>Historique des exports</CardTitle>
              <CardDescription>
                Consultez vos exports précédents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {exportsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : exports?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Aucun export effectué
                </p>
              ) : (
                <div className="space-y-4">
                  {exports?.map((exp) => (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-semibold">
                            Export {exp.logiciel?.toUpperCase()} - {exp.formatExport?.toUpperCase()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Période: {exp.periodeDebut ? new Date(exp.periodeDebut).toLocaleDateString() : "-"} au{" "}
                            {exp.periodeFin ? new Date(exp.periodeFin).toLocaleDateString() : "-"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {exp.nombreEcritures || 0} écritures
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getStatutBadge(exp.statut || "en_cours")}
                        <span className="text-sm text-muted-foreground">
                          {exp.createdAt ? new Date(exp.createdAt).toLocaleDateString() : "-"}
                        </span>
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
