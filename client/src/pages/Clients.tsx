import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Plus, Search, Phone, Mail, MapPin, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

export function Clients() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  
  // State pour le formulaire d'édition
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  
  // State pour la recherche
  const [searchQuery, setSearchQuery] = useState("");

  // Queries
  const { data: clients = [], isLoading } = trpc.clients.list.useQuery();
  
  // Mutations
  const updateMutation = trpc.clients.update.useMutation({
    onSuccess: () => {
      toast.success("Client mis à jour");
      setFormData(initialFormData);
      setEditingClientId(null);
      setIsEditModalOpen(false);
      utils.clients.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de la mise à jour");
    },
  });

  const deleteMutation = trpc.clients.delete.useMutation({
    onSuccess: () => {
      toast.success("Client supprimé");
      utils.clients.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de la suppression");
    },
  });

  // Handler pour les changements d'input
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  // Handler pour réinitialiser le formulaire
  const resetForm = useCallback(() => {
    setFormData(initialFormData);
  }, []);

  // Handler pour fermer la modale d'édition
  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    resetForm();
    setEditingClientId(null);
  }, [resetForm]);

  // Handler pour ouvrir la modale d'édition
  const handleOpenEditModal = useCallback((client: any) => {
    setFormData({
      nom: client.nom,
      prenom: client.prenom || "",
      email: client.email || "",
      telephone: client.telephone || "",
      adresse: client.adresse || "",
      codePostal: client.codePostal || "",
      ville: client.ville || "",
      notes: client.notes || "",
    });
    setEditingClientId(client.id);
    setIsEditModalOpen(true);
  }, []);

  // Handler pour soumettre le formulaire d'édition
  const handleSubmitEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    if (editingClientId) {
      await updateMutation.mutateAsync({
        id: editingClientId,
        ...formData,
      });
    }
  }, [formData, editingClientId, updateMutation]);

  // Handler pour supprimer un client
  const handleDelete = useCallback((clientId: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
      deleteMutation.mutate({ id: clientId });
    }
  }, [deleteMutation]);

  // Handler pour la recherche
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  // Filtrer les clients
  const filteredClients = clients.filter(client =>
    client.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.telephone?.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-gray-600">Gérez votre base de clients</p>
        </div>
        <Button onClick={() => navigate('/clients/nouveau')} className="gap-2">
          <Plus className="w-4 h-4" />
          Nouveau client
        </Button>
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Rechercher un client..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="pl-10"
        />
      </div>

      {/* Liste des clients */}
      {isLoading ? (
        <div className="text-center py-8">Chargement...</div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchQuery ? "Aucun client trouvé" : "Aucun client créé"}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredClients.map(client => (
            <Card key={client.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{client.nom} {client.prenom}</h3>
                    <div className="space-y-1 text-sm text-gray-600 mt-2">
                      {client.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {client.email}
                        </div>
                      )}
                      {client.telephone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          {client.telephone}
                        </div>
                      )}
                      {client.adresse && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {client.adresse}, {client.codePostal} {client.ville}
                        </div>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenEditModal(client)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Éditer
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(client.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Édition Client */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 z-40 bg-black/50" onClick={handleCloseEditModal} />
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Éditer le client</h2>
              <button onClick={handleCloseEditModal} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmitEdit} className="space-y-4">
                {/* Nom */}
                <div>
                  <Label htmlFor="edit-nom" className="block text-sm font-medium mb-1">
                    Nom *
                  </Label>
                  <input
                    id="edit-nom"
                    type="text"
                    name="nom"
                    value={formData.nom}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Prénom */}
                <div>
                  <Label htmlFor="edit-prenom" className="block text-sm font-medium mb-1">
                    Prénom
                  </Label>
                  <input
                    id="edit-prenom"
                    type="text"
                    name="prenom"
                    value={formData.prenom}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <Label htmlFor="edit-email" className="block text-sm font-medium mb-1">
                    Email
                  </Label>
                  <input
                    id="edit-email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Téléphone */}
                <div>
                  <Label htmlFor="edit-telephone" className="block text-sm font-medium mb-1">
                    Téléphone
                  </Label>
                  <input
                    id="edit-telephone"
                    type="tel"
                    name="telephone"
                    value={formData.telephone}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Adresse */}
                <div>
                  <Label htmlFor="edit-adresse" className="block text-sm font-medium mb-1">
                    Adresse
                  </Label>
                  <input
                    id="edit-adresse"
                    type="text"
                    name="adresse"
                    value={formData.adresse}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Code Postal et Ville */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-codePostal" className="block text-sm font-medium mb-1">
                      Code Postal
                    </Label>
                    <input
                      id="edit-codePostal"
                      type="text"
                      name="codePostal"
                      value={formData.codePostal}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-ville" className="block text-sm font-medium mb-1">
                      Ville
                    </Label>
                    <input
                      id="edit-ville"
                      type="text"
                      name="ville"
                      value={formData.ville}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="edit-notes" className="block text-sm font-medium mb-1">
                    Notes
                  </Label>
                  <textarea
                    id="edit-notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Boutons */}
                <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
                  <button
                    type="button"
                    onClick={handleCloseEditModal}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400"
                  >
                    {updateMutation.isPending ? "Mise à jour..." : "Mettre à jour"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
