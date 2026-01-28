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
  notes: string;
}

const initialFormData: ClientFormData = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  adresse: "",
  codePostal: "",
  ville: "",
  notes: "",
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
          {/* Nom et Prénom */}
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </Label>
              <input
                id="email"
                type="email"
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
          <div className="grid grid-cols-2 gap-4">
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
