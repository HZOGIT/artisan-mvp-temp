import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { User, Mail, Phone, MapPin, Briefcase, Hash, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function Profile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Fetch artisan profile
  const { data: artisan, isLoading: artisanLoading } = trpc.artisan.getProfile.useQuery();

  // Form state
  const [formData, setFormData] = useState({
    siret: artisan?.siret || "",
    nomEntreprise: artisan?.nomEntreprise || "",
    adresse: artisan?.adresse || "",
    codePostal: artisan?.codePostal || "",
    ville: artisan?.ville || "",
    telephone: artisan?.telephone || "",
    email: artisan?.email || "",
    specialite: artisan?.specialite || "plomberie",
    tauxTVA: artisan?.tauxTVA || "20",
  });

  // Update profile mutation
  const updateProfileMutation = trpc.artisan.updateProfile.useMutation({
    onSuccess: () => {
      setSuccessMessage("Profil mis à jour avec succès !");
      setIsEditing(false);
      setTimeout(() => setSuccessMessage(""), 3000);
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    await updateProfileMutation.mutateAsync(formData);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-semibold">Non authentifié</p>
          <p className="text-muted-foreground">Veuillez vous connecter pour accéder à votre profil.</p>
        </div>
      </div>
    );
  }

  if (artisanLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Mon Profil</h1>
        <p className="text-muted-foreground mt-1">
          Gérez vos informations personnelles et professionnelles
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {/* User Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informations Personnelles
          </CardTitle>
          <CardDescription>
            Vos données de connexion Manus
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Nom</Label>
              <p className="text-base font-semibold mt-1">{user.name || "-"}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Email</Label>
              <p className="text-base font-semibold mt-1 flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {user.email || "-"}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">ID Utilisateur</Label>
              <p className="text-sm font-mono mt-1 text-muted-foreground break-all">{user.id}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Membre depuis</Label>
              <p className="text-base font-semibold mt-1">
                {user.createdAt ? format(new Date(user.createdAt), "d MMMM yyyy", { locale: fr }) : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Artisan Profile Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Profil Artisan
            </CardTitle>
            <CardDescription>
              Vos informations professionnelles
            </CardDescription>
          </div>
          <Button
            variant={isEditing ? "outline" : "default"}
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "Annuler" : "Modifier"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {isEditing ? (
            <div className="space-y-4">
              {/* SIRET */}
              <div>
                <Label htmlFor="siret" className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  SIRET
                </Label>
                <Input
                  id="siret"
                  value={formData.siret}
                  onChange={(e) => handleInputChange("siret", e.target.value)}
                  placeholder="Numéro SIRET"
                  className="mt-1"
                />
              </div>

              {/* Nom Entreprise */}
              <div>
                <Label htmlFor="nomEntreprise" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Nom de l'Entreprise
                </Label>
                <Input
                  id="nomEntreprise"
                  value={formData.nomEntreprise}
                  onChange={(e) => handleInputChange("nomEntreprise", e.target.value)}
                  placeholder="Nom de votre entreprise"
                  className="mt-1"
                />
              </div>

              {/* Spécialité */}
              <div>
                <Label htmlFor="specialite">Spécialité</Label>
                <Select value={formData.specialite} onValueChange={(value) => handleInputChange("specialite", value)}>
                  <SelectTrigger id="specialite" className="mt-1">
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

              {/* Adresse */}
              <div>
                <Label htmlFor="adresse" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Adresse
                </Label>
                <Textarea
                  id="adresse"
                  value={formData.adresse}
                  onChange={(e) => handleInputChange("adresse", e.target.value)}
                  placeholder="Votre adresse professionnelle"
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>

              {/* Code Postal et Ville */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="codePostal">Code Postal</Label>
                  <Input
                    id="codePostal"
                    value={formData.codePostal}
                    onChange={(e) => handleInputChange("codePostal", e.target.value)}
                    placeholder="75000"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ville">Ville</Label>
                  <Input
                    id="ville"
                    value={formData.ville}
                    onChange={(e) => handleInputChange("ville", e.target.value)}
                    placeholder="Paris"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Téléphone et Email */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="telephone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Téléphone
                  </Label>
                  <Input
                    id="telephone"
                    value={formData.telephone}
                    onChange={(e) => handleInputChange("telephone", e.target.value)}
                    placeholder="01 23 45 67 89"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Professionnel
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="contact@entreprise.fr"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Taux TVA */}
              <div>
                <Label htmlFor="tauxTVA">Taux TVA (%)</Label>
                <Input
                  id="tauxTVA"
                  value={formData.tauxTVA}
                  onChange={(e) => handleInputChange("tauxTVA", e.target.value)}
                  placeholder="20"
                  className="mt-1"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSubmit}
                  disabled={updateProfileMutation.isPending}
                  className="flex-1"
                >
                  {updateProfileMutation.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="flex-1"
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  SIRET
                </Label>
                <p className="text-base font-semibold mt-1">{artisan?.siret || "-"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Nom de l'Entreprise
                </Label>
                <p className="text-base font-semibold mt-1">{artisan?.nomEntreprise || "-"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Spécialité</Label>
                <p className="text-base font-semibold mt-1 capitalize">{artisan?.specialite || "-"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Taux TVA</Label>
                <p className="text-base font-semibold mt-1">{artisan?.tauxTVA || "-"}%</p>
              </div>
              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Adresse
                </Label>
                <p className="text-base font-semibold mt-1">{artisan?.adresse || "-"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Code Postal</Label>
                <p className="text-base font-semibold mt-1">{artisan?.codePostal || "-"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Ville</Label>
                <p className="text-base font-semibold mt-1">{artisan?.ville || "-"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Téléphone
                </Label>
                <p className="text-base font-semibold mt-1">{artisan?.telephone || "-"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Professionnel
                </Label>
                <p className="text-base font-semibold mt-1">{artisan?.email || "-"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
