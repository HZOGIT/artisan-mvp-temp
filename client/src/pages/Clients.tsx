import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useModal } from "@/contexts/ModalContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BulletproofModal } from "@/components/BulletproofModal";
import { Plus, Search, User, Phone, Mail, MapPin, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function Clients() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingClient, setEditingClient] = useState<any>(null);
  const { isCreateClientModalOpen, openCreateClientModal, closeCreateClientModal } = useModal();

  const [formData, setFormData] = useState({
    nom: "",
    prenom: "",
    email: "",
    telephone: "",
    adresse: "",
    codePostal: "",
    ville: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: clients, isLoading } = trpc.clients.list.useQuery();
  
  const createMutation = trpc.clients.create.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      resetForm();
      closeCreateClientModal();
      toast.success("Client créé avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la création du client");
    },
  });

  const updateMutation = trpc.clients.update.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      setEditingClient(null);
      resetForm();
      toast.success("Client mis à jour avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour du client");
    },
  });

  const deleteMutation = trpc.clients.delete.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      toast.success("Client supprimé avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression du client");
    },
  });

  const resetForm = useCallback(() => {
    setFormData({
      nom: "",
      prenom: "",
      email: "",
      telephone: "",
      adresse: "",
      codePostal: "",
      ville: "",
      notes: "",
    });
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nom.trim()) {
      toast.error("Le nom est requis");
      return;
    }

    if (editingClient) {
      updateMutation.mutate({
        id: editingClient.id,
        ...formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  }, [formData, editingClient, createMutation, updateMutation]);

  const handleEdit = useCallback((client: any) => {
    setEditingClient(client);
    setFormData(client);
  }, []);

  const handleDelete = useCallback((id: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
      deleteMutation.mutate({ id });
    }
  }, [deleteMutation]);

  const filteredClients = clients?.filter((client) =>
    client.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-muted-foreground">Gérez votre base de clients</p>
        </div>
        <Button onClick={() => {
          resetForm();
          setEditingClient(null);
          openCreateClientModal();
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau client
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un client..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Create Modal */}
      <BulletproofModal
        isOpen={isCreateClientModalOpen && !editingClient}
        onClose={() => {
          closeCreateClientModal();
          resetForm();
        }}
        title="Nouveau client"
        description="Remplissez les informations du nouveau client"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                closeCreateClientModal();
                resetForm();
              }}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              onClick={handleSubmit}
            >
              {createMutation.isPending ? "Création..." : "Créer le client"}
            </Button>
          </div>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom *</Label>
              <Input
                id="nom"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom</Label>
              <Input
                id="prenom"
                value={formData.prenom}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input
                id="telephone"
                value={formData.telephone}
                onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adresse">Adresse</Label>
            <Input
              id="adresse"
              value={formData.adresse}
              onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codePostal">Code Postal</Label>
              <Input
                id="codePostal"
                value={formData.codePostal}
                onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ville">Ville</Label>
              <Input
                id="ville"
                value={formData.ville}
                onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
        </form>
      </BulletproofModal>

      {/* Edit Modal */}
      <BulletproofModal
        isOpen={!!editingClient}
        onClose={() => {
          setEditingClient(null);
          resetForm();
        }}
        title="Modifier le client"
        description="Modifiez les informations du client"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingClient(null);
                resetForm();
              }}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              onClick={handleSubmit}
            >
              {updateMutation.isPending ? "Mise à jour..." : "Mettre à jour"}
            </Button>
          </div>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nom">Nom *</Label>
              <Input
                id="edit-nom"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-prenom">Prénom</Label>
              <Input
                id="edit-prenom"
                value={formData.prenom}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-telephone">Téléphone</Label>
              <Input
                id="edit-telephone"
                value={formData.telephone}
                onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-adresse">Adresse</Label>
            <Input
              id="edit-adresse"
              value={formData.adresse}
              onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-codePostal">Code Postal</Label>
              <Input
                id="edit-codePostal"
                value={formData.codePostal}
                onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-ville">Ville</Label>
              <Input
                id="edit-ville"
                value={formData.ville}
                onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
        </form>
      </BulletproofModal>

      {/* Clients List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucun client</h3>
            <p className="text-muted-foreground mb-6">
              Commencez par ajouter votre premier client
            </p>
            <Button onClick={() => {
              resetForm();
              setEditingClient(null);
              openCreateClientModal();
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredClients.map((client) => (
            <Card key={client.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">
                      {client.prenom} {client.nom}
                    </h3>
                    <div className="grid grid-cols-2 gap-4 mt-4 text-sm text-muted-foreground">
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
                          {client.adresse}
                        </div>
                      )}
                    </div>
                    {client.notes && (
                      <p className="mt-4 text-sm text-muted-foreground">
                        {client.notes}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(client)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(client.id)}
                        className="text-red-600"
                      >
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
    </div>
  );
}
