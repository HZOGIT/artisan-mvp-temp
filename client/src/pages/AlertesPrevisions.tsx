import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, AlertTriangle, TrendingUp, TrendingDown, Settings, History, Play } from "lucide-react";

export default function AlertesPrevisions() {
  const { data: config, refetch: refetchConfig } = trpc.alertesPrevisions.getConfig.useQuery();
  const { data: historique, refetch: refetchHistorique } = trpc.alertesPrevisions.getHistorique.useQuery();

  const [formData, setFormData] = useState({
    seuilAlertePositif: "10",
    seuilAlerteNegatif: "10",
    alerteEmail: true,
    alerteSms: false,
    emailDestination: "",
    telephoneDestination: "",
    frequenceVerification: "hebdomadaire" as "quotidien" | "hebdomadaire" | "mensuel",
    actif: true,
  });

  useEffect(() => {
    if (config) {
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
    }
  }, [config]);

  const saveMutation = trpc.alertesPrevisions.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuration sauvegardée");
      refetchConfig();
    },
  });

  const verifierMutation = trpc.alertesPrevisions.verifierEtEnvoyer.useMutation({
    onSuccess: (alertes) => {
      if (alertes.length > 0) {
        toast.success(`${alertes.length} alerte(s) envoyée(s)`);
      } else {
        toast.info("Aucun écart significatif détecté");
      }
      refetchHistorique();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const getTypeAlerteBadge = (type: string) => {
    if (type === "positif") {
      return (
        <Badge className="bg-green-500">
          <TrendingUp className="h-3 w-3 mr-1" />
          Positif
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-500">
        <TrendingDown className="h-3 w-3 mr-1" />
        Négatif
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Alertes Prévisions CA</h1>
          <p className="text-muted-foreground">
            Configurez les alertes automatiques pour les écarts de chiffre d'affaires
          </p>
        </div>
        <Button
          onClick={() => verifierMutation.mutate()}
          disabled={verifierMutation.isPending}
        >
          <Play className="h-4 w-4 mr-2" />
          Vérifier maintenant
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration
            </CardTitle>
            <CardDescription>
              Définissez les seuils et canaux de notification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Activation */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Alertes activées</Label>
                  <p className="text-sm text-muted-foreground">
                    Activer ou désactiver les alertes automatiques
                  </p>
                </div>
                <Switch
                  checked={formData.actif}
                  onCheckedChange={(v) => setFormData({ ...formData, actif: v })}
                />
              </div>

              {/* Seuils */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Seuil positif (%)
                  </Label>
                  <Input
                    type="number"
                    value={formData.seuilAlertePositif}
                    onChange={(e) => setFormData({ ...formData, seuilAlertePositif: e.target.value })}
                    placeholder="10"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Alerte si CA dépasse les prévisions de ce %
                  </p>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    Seuil négatif (%)
                  </Label>
                  <Input
                    type="number"
                    value={formData.seuilAlerteNegatif}
                    onChange={(e) => setFormData({ ...formData, seuilAlerteNegatif: e.target.value })}
                    placeholder="10"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Alerte si CA est inférieur aux prévisions de ce %
                  </p>
                </div>
              </div>

              {/* Fréquence */}
              <div>
                <Label>Fréquence de vérification</Label>
                <Select
                  value={formData.frequenceVerification}
                  onValueChange={(v) => setFormData({ ...formData, frequenceVerification: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quotidien">Quotidien</SelectItem>
                    <SelectItem value="hebdomadaire">Hebdomadaire</SelectItem>
                    <SelectItem value="mensuel">Mensuel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Canaux */}
              <div className="space-y-4">
                <Label>Canaux de notification</Label>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">Recevoir les alertes par email</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.alerteEmail}
                    onCheckedChange={(v) => setFormData({ ...formData, alerteEmail: v })}
                  />
                </div>

                {formData.alerteEmail && (
                  <Input
                    type="email"
                    value={formData.emailDestination}
                    onChange={(e) => setFormData({ ...formData, emailDestination: e.target.value })}
                    placeholder="email@exemple.com"
                  />
                )}

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">SMS</p>
                      <p className="text-sm text-muted-foreground">Recevoir les alertes par SMS</p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.alerteSms}
                    onCheckedChange={(v) => setFormData({ ...formData, alerteSms: v })}
                  />
                </div>

                {formData.alerteSms && (
                  <Input
                    type="tel"
                    value={formData.telephoneDestination}
                    onChange={(e) => setFormData({ ...formData, telephoneDestination: e.target.value })}
                    placeholder="+33 6 12 34 56 78"
                  />
                )}
              </div>

              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                Sauvegarder la configuration
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Historique */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historique des alertes
            </CardTitle>
            <CardDescription>
              Dernières alertes envoyées
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {historique?.map((alerte: any) => (
                <div key={alerte.id} className="flex items-start gap-4 p-3 border rounded-lg">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getTypeAlerteBadge(alerte.typeAlerte)}
                      <span className="text-sm text-muted-foreground">
                        {new Date(alerte.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm">{alerte.message}</p>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Prévu: {parseFloat(alerte.caPrevisionnel || "0").toLocaleString()}€</span>
                      <span>Réel: {parseFloat(alerte.caReel || "0").toLocaleString()}€</span>
                      <span>Écart: {alerte.ecartPourcentage}%</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {alerte.emailEnvoye && (
                        <Badge variant="outline" className="text-xs">
                          <Mail className="h-3 w-3 mr-1" />
                          Email envoyé
                        </Badge>
                      )}
                      {alerte.smsEnvoye && (
                        <Badge variant="outline" className="text-xs">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          SMS envoyé
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!historique || historique.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucune alerte envoyée</p>
                  <p className="text-sm">Les alertes apparaîtront ici lorsqu'un écart sera détecté</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
