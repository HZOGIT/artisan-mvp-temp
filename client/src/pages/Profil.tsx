import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Phone, Mail, MapPin, Save, CreditCard } from "lucide-react";
import { toast } from "sonner";

export default function Profil() {
  const [formData, setFormData] = useState({
    nomEntreprise: "",
    siret: "",
    numeroTVA: "",
    codeAPE: "",
    specialite: "plomberie" as string,
    telephone: "",
    email: "",
    adresse: "",
    codePostal: "",
    ville: "",
    tauxTVA: "20.00",
    iban: "",
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
        nomEntreprise: artisan.nomEntreprise || "",
        siret: artisan.siret || "",
        numeroTVA: (artisan as any).numeroTVA || "",
        codeAPE: (artisan as any).codeAPE || "",
        specialite: artisan.specialite || "plomberie",
        telephone: artisan.telephone || "",
        email: artisan.email || "",
        adresse: artisan.adresse || "",
        codePostal: artisan.codePostal || "",
        ville: artisan.ville || "",
        tauxTVA: artisan.tauxTVA || "20.00",
        iban: (artisan as any).iban || "",
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
                <Label htmlFor="nomEntreprise">Raison sociale</Label>
                <Input
                  id="nomEntreprise"
                  value={formData.nomEntreprise}
                  onChange={(e) => setFormData({ ...formData, nomEntreprise: e.target.value })}
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
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="numeroTVA">N° TVA intracommunautaire</Label>
                <Input
                  id="numeroTVA"
                  value={formData.numeroTVA}
                  onChange={(e) => setFormData({ ...formData, numeroTVA: e.target.value })}
                  placeholder="FR 12 345678901"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codeAPE">Code APE / NAF</Label>
                <Input
                  id="codeAPE"
                  value={formData.codeAPE}
                  onChange={(e) => setFormData({ ...formData, codeAPE: e.target.value })}
                  placeholder="4322A"
                />
              </div>
              <div className="space-y-2">
                <Label>Spécialité</Label>
                <Select
                  value={formData.specialite}
                  onValueChange={(v) => setFormData({ ...formData, specialite: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plomberie">Plomberie</SelectItem>
                    <SelectItem value="electricite">Électricité</SelectItem>
                    <SelectItem value="chauffage">Chauffage</SelectItem>
                    <SelectItem value="multi-services">Multi-services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tauxTVA">Taux de TVA par défaut (%)</Label>
              <Input
                id="tauxTVA"
                type="number"
                step="0.01"
                className="max-w-[200px]"
                value={formData.tauxTVA}
                onChange={(e) => setFormData({ ...formData, tauxTVA: e.target.value })}
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

        {/* Informations bancaires */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Informations bancaires
            </CardTitle>
            <CardDescription>
              L'IBAN sera affiché sur vos factures pour faciliter le paiement
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="iban">IBAN</Label>
              <Input
                id="iban"
                value={formData.iban}
                onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                placeholder="FR76 1234 5678 9012 3456 7890 123"
              />
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
