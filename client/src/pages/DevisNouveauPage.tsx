import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function DevisNouveauPage() {
  const [, navigate] = useLocation();
  const [clientId, setClientId] = useState("");

  const { data: clients } = trpc.clients.getAll.useQuery();
  const createDevisMutation = trpc.devis.create.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      alert("Veuillez sélectionner un client");
      return;
    }

    try {
      const result = await createDevisMutation.mutateAsync({
        clientId: parseInt(clientId),
        description: "Nouveau devis",
        montantHT: 0,
        montantTVA: 0,
        montantTTC: 0,
      });

      if (result?.id) {
        navigate(`/devis/${result.id}/ligne/nouvelle`);
      }
    } catch (error) {
      console.error("Erreur lors de la création du devis:", error);
      alert("Erreur lors de la création du devis");
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Nouveau Devis</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="">Sélectionner un client</option>
            {clients?.map((client) => (
              <option key={client.id} value={client.id}>
                {client.nom} {client.prenom}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={createDevisMutation.isPending}>
            {createDevisMutation.isPending ? "Création..." : "Créer le devis"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/devis")}
          >
            Annuler
          </Button>
        </div>
      </form>
    </div>
  );
}
