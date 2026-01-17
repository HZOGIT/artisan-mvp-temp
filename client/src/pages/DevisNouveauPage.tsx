import { useState, useCallback } from "react";
import { useRouter } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface DevisFormData {
  clientId: number;
  dateDevis: string;
  dateExpiration: string;
  notes: string;
}

const initialFormData: DevisFormData = {
  clientId: 0,
  dateDevis: new Date().toISOString().split('T')[0],
  dateExpiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  notes: "",
};

export function DevisNouveauPage() {
  const router = useRouter();
  const navigate = (path: string) => router.push(path);
  const [formData, setFormData] = useState<DevisFormData>(initialFormData);
  const utils = trpc.useUtils();

  // Récupérer la liste des clients
  const { data: clients = [] } = trpc.clients.list.useQuery();

  const createMutation = trpc.devis.create.useMutation({
    onSuccess: (devis) => {
      toast.success("Devis créé avec succès");
      utils.devis.list.invalidate();
      navigate(`/devis/${devis.id}`);
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de la création");
    },
  });

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'clientId' ? parseInt(value) : value
    }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      toast.error("Veuillez sélectionner un client");
      return;
    }
    await createMutation.mutateAsync(formData);
  }, [formData, createMutation]);

  const handleCancel = useCallback(() => {
    navigate("/devis");
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
          <h1 className="text-3xl font-bold">Nouveau devis</h1>
          <p className="text-gray-600">Créer un nouveau devis</p>
        </div>
      </div>

      {/* Formulaire */}
      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
          {/* Client */}
          <div>
            <Label htmlFor="clientId" className="block text-sm font-medium mb-2">
              Client *
            </Label>
            <select
              id="clientId"
              name="clientId"
              value={formData.clientId}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="0">Sélectionner un client...</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.nom} {client.prenom}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dateDevis" className="block text-sm font-medium mb-2">
                Date du devis
              </Label>
              <input
                id="dateDevis"
                type="date"
                name="dateDevis"
                value={formData.dateDevis}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <Label htmlFor="dateExpiration" className="block text-sm font-medium mb-2">
                Date d'expiration
              </Label>
              <input
                id="dateExpiration"
                type="date"
                name="dateExpiration"
                value={formData.dateExpiration}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Notes du devis..."
            />
          </div>

          {/* Boutons */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={createMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Création..." : "Créer le devis"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
