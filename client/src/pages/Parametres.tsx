import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Settings, FileText, Bell, Save, Globe, ExternalLink } from "lucide-react";
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
    vitrineActive: false,
    vitrineDescription: "",
    vitrineZone: "",
    vitrineServices: "",
    vitrineExperience: "",
    slug: "",
  });

  const { data: parametres, isLoading } = trpc.parametres.get.useQuery();
  const { data: artisan } = trpc.artisan.getProfile.useQuery();

  const updateMutation = trpc.parametres.update.useMutation({
    onSuccess: () => {
      toast.success("Paramètres enregistrés avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement des paramètres");
    },
  });

  const updateProfileMutation = trpc.artisan.updateProfile.useMutation({
    onError: (err) => {
      toast.error(err.message || "Erreur lors de la mise à jour du slug");
    },
  });

  useEffect(() => {
    if (parametres) {
      let services = "";
      if (parametres.vitrineServices) {
        try { services = JSON.parse(parametres.vitrineServices).join("\n"); } catch { services = parametres.vitrineServices; }
      }
      setFormData((prev) => ({
        ...prev,
        prefixeDevis: parametres.prefixeDevis || "DEV-",
        prefixeFacture: parametres.prefixeFacture || "FAC-",
        mentionsLegalesDevis: parametres.mentionsLegales || "",
        mentionsLegalesFacture: parametres.conditionsGenerales || "",
        conditionsPaiementDefaut: "Paiement à réception de facture",
        delaiValiditeDevis: String(parametres.rappelDevisJours || 30),
        notificationsEmail: parametres.notificationsEmail ?? true,
        vitrineActive: parametres.vitrineActive ?? false,
        vitrineDescription: parametres.vitrineDescription || "",
        vitrineZone: parametres.vitrineZone || "",
        vitrineServices: services,
        vitrineExperience: String(parametres.vitrineExperience || ""),
      }));
    }
  }, [parametres]);

  useEffect(() => {
    if (artisan?.slug) {
      setFormData((prev) => ({ ...prev, slug: artisan.slug || "" }));
    }
  }, [artisan]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      prefixeDevis: formData.prefixeDevis,
      prefixeFacture: formData.prefixeFacture,
      mentionsLegales: formData.mentionsLegalesDevis,
      conditionsGenerales: formData.mentionsLegalesFacture,
      notificationsEmail: formData.notificationsEmail,
      rappelDevisJours: parseInt(formData.delaiValiditeDevis) || 30,
      vitrineActive: formData.vitrineActive,
      vitrineDescription: formData.vitrineDescription,
      vitrineZone: formData.vitrineZone,
      vitrineServices: formData.vitrineServices,
      vitrineExperience: formData.vitrineExperience ? parseInt(formData.vitrineExperience) : undefined,
    });
    if (formData.slug && formData.slug !== (artisan?.slug || "")) {
      updateProfileMutation.mutate({ slug: formData.slug });
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

        {/* Vitrine publique */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Ma page vitrine
            </CardTitle>
            <CardDescription>
              Configurez votre page publique partageable avec vos clients
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Vitrine active</Label>
                <p className="text-sm text-muted-foreground">
                  Rendre votre page vitrine accessible au public
                </p>
              </div>
              <Switch
                checked={formData.vitrineActive}
                onCheckedChange={(checked) => setFormData({ ...formData, vitrineActive: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL de votre vitrine</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">/vitrine/</span>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="mon-entreprise"
                  className="max-w-xs"
                />
              </div>
              {formData.slug && (
                <a
                  href={`/vitrine/${formData.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Voir ma vitrine
                </a>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vitrineDescription">Description de l'entreprise</Label>
              <Textarea
                id="vitrineDescription"
                value={formData.vitrineDescription}
                onChange={(e) => setFormData({ ...formData, vitrineDescription: e.target.value })}
                placeholder="Décrivez votre entreprise, votre savoir-faire..."
                rows={4}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vitrineZone">Zone d'intervention</Label>
                <Input
                  id="vitrineZone"
                  value={formData.vitrineZone}
                  onChange={(e) => setFormData({ ...formData, vitrineZone: e.target.value })}
                  placeholder="Paris et Île-de-France"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vitrineExperience">Années d'expérience</Label>
                <Input
                  id="vitrineExperience"
                  type="number"
                  value={formData.vitrineExperience}
                  onChange={(e) => setFormData({ ...formData, vitrineExperience: e.target.value })}
                  placeholder="15"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vitrineServices">Services proposés (un par ligne)</Label>
              <Textarea
                id="vitrineServices"
                value={formData.vitrineServices}
                onChange={(e) => setFormData({ ...formData, vitrineServices: e.target.value })}
                placeholder={"Installation plomberie\nDépannage urgent\nRénovation salle de bain"}
                rows={4}
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
