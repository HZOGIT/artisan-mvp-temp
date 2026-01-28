import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { User, Building, Phone, Mail, MapPin, Save } from "lucide-react";
import { toast } from "sonner";

export default function Profil() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    raisonSociale: "",
    siret: "",
    specialite: "plomberie" as const,
    telephone: "",
    email: "",
    adresse: "",
    codePostal: "",
    ville: "",
    description: "",
    tauxTVA: "20.00",
  });

  const { data: artisan, isLoading } = trpc.artisan.getProfile.useQuery();

  const updateMutation = trpc.artisan.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profil mis à jour avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour du profil");
    },
  });

  useEffect(() => {
    if (artisan) {
      setFormData({
        raisonSociale: artisan.nomEntreprise || "",
        siret: artisan.siret || "",
        specialite: (artisan.specialite as any) || "plomberie",
        telephone: artisan.telephone || "",
        email: artisan.email || "",
        adresse: artisan.adresse || "",
        codePostal: artisan.codePostal || "",
        ville: artisan.ville || "",
        description: "",
        tauxTVA: artisan.tauxTVA || "20.00",
      });
    }
  }, [artisan]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
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
        <h1 className="text-3xl font-bold text-foreground">Mon profil</h1>
        <p className="text-muted-foreground mt-1">
          Gérez les informations de votre entreprise
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informations entreprise */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Informations entreprise
            </CardTitle>
            <CardDescription>
              Ces informations apparaîtront sur vos devis et factures
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="raisonSociale">Raison sociale</Label>
                <Input
                  id="raisonSociale"
                  value={formData.raisonSociale}
                  onChange={(e) => setFormData({ ...formData, raisonSociale: e.target.value })}
                  placeholder="Nom de votre entreprise"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="siret">SIRET</Label>
                <Input
                  id="siret"
                  value={formData.siret}
                  onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
                  placeholder="123 456 789 00012"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Spécialité</Label>
                <Select 
                  value={formData.specialite} 
                  onValueChange={(v) => setFormData({ ...formData, specialite: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plomberie">Plomberie</SelectItem>
                    <SelectItem value="electricite">Électricité</SelectItem>
                    <SelectItem value="chauffage">Chauffage</SelectItem>
                    <SelectItem value="multi_services">Multi-services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tauxTVA">Taux de TVA par défaut (%)</Label>
                <Input
                  id="tauxTVA"
                  type="number"
                  step="0.01"
                  value={formData.tauxTVA}
                  onChange={(e) => setFormData({ ...formData, tauxTVA: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description de l'activité</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Décrivez votre activité..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Coordonnées */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Coordonnées
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telephone">Téléphone</Label>
                <Input
                  id="telephone"
                  type="tel"
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                  placeholder="06 12 34 56 78"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@entreprise.fr"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Adresse */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Adresse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adresse">Adresse</Label>
              <Input
                id="adresse"
                value={formData.adresse}
                onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                placeholder="123 rue de la Plomberie"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="codePostal">Code postal</Label>
                <Input
                  id="codePostal"
                  value={formData.codePostal}
                  onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
                  placeholder="75001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ville">Ville</Label>
                <Input
                  id="ville"
                  value={formData.ville}
                  onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                  placeholder="Paris"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </div>
      </form>
    </div>
  );
}
