import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { Plus, Search, FileText, MoreHorizontal, Eye, Pencil, Trash2, ArrowRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoye: "bg-blue-100 text-blue-700",
  accepte: "bg-green-100 text-green-700",
  refuse: "bg-red-100 text-red-700",
  expire: "bg-orange-100 text-orange-700",
};

export default function Devis() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [formData, setFormData] = useState({
    objet: "",
    conditionsPaiement: "Paiement à réception de facture",
    notes: "",
    dateValidite: "",
  });

  const utils = trpc.useUtils();
  const { data: devisList, isLoading } = trpc.devis.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const createMutation = trpc.devis.create.useMutation({
    onSuccess: (data) => {
      utils.devis.list.invalidate();
      setIsCreateDialogOpen(false);
      toast.success("Devis créé avec succès");
      setLocation(`/devis/${data.id}`);
    },
    onError: () => {
      toast.error("Erreur lors de la création du devis");
    },
  });

  const deleteMutation = trpc.devis.delete.useMutation({
    onSuccess: () => {
      utils.devis.list.invalidate();
      toast.success("Devis supprimé avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression du devis");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      toast.error("Veuillez sélectionner un client");
      return;
    }
    createMutation.mutate({
      clientId: parseInt(selectedClientId),
      ...formData,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce devis ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const filteredDevis = devisList?.filter((devis: any) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      devis.numero?.toLowerCase().includes(searchLower) ||
      devis.objet?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Devis</h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos devis clients
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau devis
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau devis</DialogTitle>
              <DialogDescription>
                Créez un nouveau devis pour un client
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Client *</Label>
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((client: any) => (
                        <SelectItem key={client.id} value={String(client.id)}>
                          {client.nom} {client.prenom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="objet">Objet</Label>
                  <Input
                    id="objet"
                    value={formData.objet}
                    onChange={(e) => setFormData({ ...formData, objet: e.target.value })}
                    placeholder="Ex: Rénovation salle de bain"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateValidite">Date de validité</Label>
                  <Input
                    id="dateValidite"
                    type="date"
                    value={formData.dateValidite}
                    onChange={(e) => setFormData({ ...formData, dateValidite: e.target.value })}
                  />
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
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Création..." : "Créer le devis"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un devis..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Devis List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredDevis && filteredDevis.length > 0 ? (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Date</th>
                <th>Objet</th>
                <th>Montant TTC</th>
                <th>Statut</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredDevis.map((devis: any) => (
                <tr key={devis.id} className="cursor-pointer" onClick={() => setLocation(`/devis/${devis.id}`)}>
                  <td className="font-medium">{devis.numero}</td>
                  <td>{format(new Date(devis.dateCreation), "dd/MM/yyyy", { locale: fr })}</td>
                  <td>{devis.objet || "-"}</td>
                  <td className="font-medium">{formatCurrency(devis.totalTTC)}</td>
                  <td>
                    <Badge className={statusColors[devis.statut] || "bg-gray-100"}>
                      {statusLabels[devis.statut] || devis.statut}
                    </Badge>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setLocation(`/devis/${devis.id}`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Voir
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation(`/devis/${devis.id}`)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(devis.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery ? "Aucun devis trouvé" : "Aucun devis"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery 
                ? "Essayez avec d'autres termes de recherche"
                : "Commencez par créer votre premier devis"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Créer un devis
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
