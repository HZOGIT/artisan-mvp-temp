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
import { Plus, Search, Receipt, MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoyee: "bg-blue-100 text-blue-700",
  payee: "bg-green-100 text-green-700",
  en_retard: "bg-orange-100 text-orange-700",
  annulee: "bg-red-100 text-red-700",
};

export default function Factures() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [formData, setFormData] = useState({
    objet: "",
    conditionsPaiement: "Paiement à réception",
    notes: "",
    dateEcheance: "",
  });

  const utils = trpc.useUtils();
  const { data: facturesList, isLoading } = trpc.factures.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const createMutation = trpc.factures.create.useMutation({
    onSuccess: (data) => {
      utils.factures.list.invalidate();
      setIsCreateDialogOpen(false);
      toast.success("Facture créée avec succès");
      setLocation(`/factures/${data.id}`);
    },
    onError: () => {
      toast.error("Erreur lors de la création de la facture");
    },
  });

  const deleteMutation = trpc.factures.delete.useMutation({
    onSuccess: () => {
      utils.factures.list.invalidate();
      toast.success("Facture supprimée avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression de la facture");
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
    if (confirm("Êtes-vous sûr de vouloir supprimer cette facture ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const clientsMap = new Map((clients || []).map((c: any) => [c.id, c]));

  const filteredFactures = facturesList?.filter((facture: any) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      facture.numero?.toLowerCase().includes(searchLower) ||
      facture.objet?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Factures</h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos factures clients
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle facture
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle facture</DialogTitle>
              <DialogDescription>
                Créez une nouvelle facture pour un client
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
                    placeholder="Ex: Travaux de rénovation"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateEcheance">Date d'échéance</Label>
                  <Input
                    id="dateEcheance"
                    type="date"
                    value={formData.dateEcheance}
                    onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
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
                  {createMutation.isPending ? "Création..." : "Créer la facture"}
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
          placeholder="Rechercher une facture..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Factures List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredFactures && filteredFactures.length > 0 ? (
        <div className="bg-card rounded-lg border border-border overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Numéro</th>
                <th>Client</th>
                <th className="whitespace-nowrap text-right">Montant TTC</th>
                <th className="whitespace-nowrap">Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredFactures.map((facture: any) => {
                const client = clientsMap.get(facture.clientId);
                return (
                  <tr key={facture.id} className="cursor-pointer" onClick={() => setLocation(`/factures/${facture.id}`)}>
                    <td className="font-medium whitespace-nowrap">{facture.numero}</td>
                    <td className="whitespace-nowrap">{client ? `${client.nom} ${client.prenom || ''}`.trim() : "-"}</td>
                    <td className="font-medium text-right whitespace-nowrap">{formatCurrency(facture.totalTTC)}</td>
                    <td className="whitespace-nowrap">
                      <Badge className={statusColors[facture.statut || 'brouillon'] || "bg-gray-100"}>
                        {statusLabels[facture.statut || 'brouillon'] || facture.statut}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLocation(`/factures/${facture.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Voir
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation(`/factures/${facture.id}`)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(facture.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery ? "Aucune facture trouvée" : "Aucune facture"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery 
                ? "Essayez avec d'autres termes de recherche"
                : "Commencez par créer votre première facture"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Créer une facture
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
