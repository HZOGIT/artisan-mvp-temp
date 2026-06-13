import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface ClientFormData {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  adresseFacturation: string;
  codePostalFacturation: string;
  villeFacturation: string;
  type: "particulier" | "professionnel";
  raisonSociale: string;
  siret: string;
  numeroTVA: string;
  notes: string;
  etiquettes: string;
}

const initialFormData: ClientFormData = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  adresse: "",
  codePostal: "",
  ville: "",
  adresseFacturation: "",
  codePostalFacturation: "",
  villeFacturation: "",
  type: "particulier",
  raisonSociale: "",
  siret: "",
  numeroTVA: "",
  notes: "",
  etiquettes: "",
};

export function ClientsNouveauPage() {
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const utils = trpc.useUtils();

  const createMutation = trpc.clients.create.useMutation({
    onSuccess: () => {
      toast.success("Client créé avec succès");
      utils.clients.list.invalidate();
      navigate("/clients");
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de la création");
    },
  });

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    await createMutation.mutateAsync(formData);
  }, [formData, createMutation]);

  const handleCancel = useCallback(() => {
    navigate("/clients");
  }, [navigate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Nouveau client</h1>
          <p className="text-gray-600">Créer un nouveau client</p>
        </div>
      </div>

      {/* Formulaire */}
      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
          {/* Type de client (OPE-92) */}
          <div>
            <Label htmlFor="type" className="block text-sm font-medium mb-2">
              Type de client
            </Label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="particulier">Particulier</option>
              <option value="professionnel">Professionnel (entreprise, syndic…)</option>
            </select>
          </div>

          {/* Nom et Prénom */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nom" className="block text-sm font-medium mb-2">
                Nom *
              </Label>
              <input
                id="nom"
                type="text"
                name="nom"
                value={formData.nom}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Dupont"
              />
            </div>

            <div>
              <Label htmlFor="prenom" className="block text-sm font-medium mb-2">
                Prénom
              </Label>
              <input
                id="prenom"
                type="text"
                name="prenom"
                value={formData.prenom}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Jean"
              />
            </div>
          </div>

          {/* Email et Téléphone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </Label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="jean.dupont@email.fr"
              />
            </div>

            <div>
              <Label htmlFor="telephone" className="block text-sm font-medium mb-2">
                Téléphone
              </Label>
              <input
                id="telephone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                name="telephone"
                value={formData.telephone}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>

          {/* Adresse */}
          <div>
            <Label htmlFor="adresse" className="block text-sm font-medium mb-2">
              Adresse
            </Label>
            <input
              id="adresse"
              type="text"
              name="adresse"
              value={formData.adresse}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="15 rue de la Paix"
            />
          </div>

          {/* Code Postal et Ville */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="codePostal" className="block text-sm font-medium mb-2">
                Code Postal
              </Label>
              <input
                id="codePostal"
                type="text"
                name="codePostal"
                value={formData.codePostal}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="75001"
                maxLength={5}
              />
            </div>

            <div>
              <Label htmlFor="ville" className="block text-sm font-medium mb-2">
                Ville
              </Label>
              <input
                id="ville"
                type="text"
                name="ville"
                value={formData.ville}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paris"
              />
            </div>
          </div>

          {/* Adresse de facturation distincte (OPE-93) — optionnelle */}
          <div className="space-y-4 rounded-md border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700">
              Adresse de facturation <span className="font-normal text-muted-foreground">(si différente de l'adresse principale — laisser vide sinon)</span>
            </p>
            <div>
              <Label htmlFor="adresseFacturation" className="block text-sm font-medium mb-2">
                Adresse de facturation
              </Label>
              <input
                id="adresseFacturation"
                type="text"
                name="adresseFacturation"
                value={formData.adresseFacturation}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Siège / domicile de facturation"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="codePostalFacturation" className="block text-sm font-medium mb-2">
                  Code postal (facturation)
                </Label>
                <input
                  id="codePostalFacturation"
                  type="text"
                  name="codePostalFacturation"
                  value={formData.codePostalFacturation}
                  onChange={handleInputChange}
                  maxLength={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <Label htmlFor="villeFacturation" className="block text-sm font-medium mb-2">
                  Ville (facturation)
                </Label>
                <input
                  id="villeFacturation"
                  type="text"
                  name="villeFacturation"
                  value={formData.villeFacturation}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Champs professionnels (OPE-92) — affichés si client pro */}
          {formData.type === "professionnel" && (
            <div className="space-y-4 rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">Informations professionnelles</p>
              <div>
                <Label htmlFor="raisonSociale" className="block text-sm font-medium mb-2">
                  Raison sociale
                </Label>
                <input
                  id="raisonSociale"
                  type="text"
                  name="raisonSociale"
                  value={formData.raisonSociale}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Dupont BTP SARL"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="siret" className="block text-sm font-medium mb-2">
                    SIRET
                  </Label>
                  <input
                    id="siret"
                    type="text"
                    name="siret"
                    value={formData.siret}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="12345678900012"
                    maxLength={14}
                  />
                </div>
                <div>
                  <Label htmlFor="numeroTVA" className="block text-sm font-medium mb-2">
                    N° TVA intracommunautaire
                  </Label>
                  <input
                    id="numeroTVA"
                    type="text"
                    name="numeroTVA"
                    value={formData.numeroTVA}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="FR00123456789"
                    maxLength={20}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Étiquettes (OPE-120) */}
          <div>
            <Label htmlFor="etiquettes" className="block text-sm font-medium mb-2">
              Étiquettes
            </Label>
            <input
              id="etiquettes"
              name="etiquettes"
              type="text"
              value={formData.etiquettes}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex : VIP, chantier neuf, syndic (séparées par des virgules)"
            />
            <p className="text-xs text-gray-500 mt-1">Pour segmenter et retrouver vos clients (recherche par étiquette).</p>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="block text-sm font-medium mb-2">
              Notes
            </Label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Notes supplémentaires..."
              rows={4}
            />
          </div>

          {/* Boutons */}
          <div className="flex gap-4 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Création..." : "Créer le client"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
