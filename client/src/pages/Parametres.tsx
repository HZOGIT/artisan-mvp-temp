import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Settings, FileText, Bell, Save } from "lucide-react";
import { toast } from "sonner";

export default function Parametres() {
  const [formData, setFormData] = useState({
    prefixeDevis: "DEV-",
    prefixeFacture: "FAC-",
    mentionsLegalesDevis: "",
    mentionsLegalesFacture: "",
    conditionsPaiementDefaut: "Paiement à réception de facture",
    delaiValiditeDevis: "30",
    notificationsEmail: true,
  });

  const { data: parametres, isLoading } = trpc.parametres.get.useQuery();

  const updateMutation = trpc.parametres.update.useMutation({
    onSuccess: () => {
      toast.success("Paramètres enregistrés avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement des paramètres");
    },
  });

  useEffect(() => {
    if (parametres) {
      setFormData({
        prefixeDevis: parametres.prefixeDevis || "DEV-",
        prefixeFacture: parametres.prefixeFacture || "FAC-",
        mentionsLegalesDevis: parametres.mentionsLegales || "",
        mentionsLegalesFacture: parametres.conditionsGenerales || "",
        conditionsPaiementDefaut: "Paiement à réception de facture",
        delaiValiditeDevis: String(parametres.rappelDevisJours || 30),
        notificationsEmail: parametres.notificationsEmail ?? true,
      });
    }
  }, [parametres]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      prefixeDevis: formData.prefixeDevis,
      prefixeFacture: formData.prefixeFacture,
      mentionsLegales: formData.mentionsLegalesDevis,
      conditionsGenerales: formData.mentionsLegalesFacture,
      notificationsEmail: formData.notificationsEmail,
      rappelDevisJours: parseInt(formData.delaiValiditeDevis) || 30,
    });
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Paramètres</h1>
        <p className="text-muted-foreground mt-1">
          Configurez les paramètres de votre application
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Numérotation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Numérotation des documents
            </CardTitle>
            <CardDescription>
              Définissez les préfixes pour vos devis et factures
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prefixeDevis">Préfixe des devis</Label>
                <Input
                  id="prefixeDevis"
                  value={formData.prefixeDevis}
                  onChange={(e) => setFormData({ ...formData, prefixeDevis: e.target.value })}
                  placeholder="DEV-"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prefixeFacture">Préfixe des factures</Label>
                <Input
                  id="prefixeFacture"
                  value={formData.prefixeFacture}
                  onChange={(e) => setFormData({ ...formData, prefixeFacture: e.target.value })}
                  placeholder="FAC-"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delaiValiditeDevis">Délai de validité des devis (jours)</Label>
              <Input
                id="delaiValiditeDevis"
                type="number"
                value={formData.delaiValiditeDevis}
                onChange={(e) => setFormData({ ...formData, delaiValiditeDevis: e.target.value })}
                className="max-w-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Mentions légales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Mentions légales
            </CardTitle>
            <CardDescription>
              Textes qui apparaîtront sur vos documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conditionsPaiementDefaut">Conditions de paiement par défaut</Label>
              <Input
                id="conditionsPaiementDefaut"
                value={formData.conditionsPaiementDefaut}
                onChange={(e) => setFormData({ ...formData, conditionsPaiementDefaut: e.target.value })}
                placeholder="Paiement à réception de facture"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mentionsLegalesDevis">Mentions légales des devis</Label>
              <Textarea
                id="mentionsLegalesDevis"
                value={formData.mentionsLegalesDevis}
                onChange={(e) => setFormData({ ...formData, mentionsLegalesDevis: e.target.value })}
                placeholder="Mentions légales à afficher sur les devis..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mentionsLegalesFacture">Mentions légales des factures</Label>
              <Textarea
                id="mentionsLegalesFacture"
                value={formData.mentionsLegalesFacture}
                onChange={(e) => setFormData({ ...formData, mentionsLegalesFacture: e.target.value })}
                placeholder="Mentions légales à afficher sur les factures..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notifications par email</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir des notifications par email pour les événements importants
                </p>
              </div>
              <Switch
                checked={formData.notificationsEmail}
                onCheckedChange={(checked) => setFormData({ ...formData, notificationsEmail: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Enregistrement..." : "Enregistrer les paramètres"}
          </Button>
        </div>
      </form>
    </div>
  );
}
