import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { Plus, Search, ShoppingCart, MoreHorizontal, Eye, Pencil, Trash2, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  confirmee: "Confirmée",
  livree: "Livrée",
  annulee: "Annulée",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoyee: "bg-blue-100 text-blue-700",
  confirmee: "bg-orange-100 text-orange-700",
  livree: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
};

function formatCurrency(value: any): string {
  const num = parseFloat(value) || 0;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
}

export default function CommandesFournisseurs() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatut, setFilterStatut] = useState("tous");
  const [filterFournisseur, setFilterFournisseur] = useState("tous");

  const { data: commandes, isLoading } = trpc.commandesFournisseurs.list.useQuery();
  const { data: fournisseurs } = trpc.fournisseurs.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.commandesFournisseurs.delete.useMutation({
    onSuccess: () => {
      utils.commandesFournisseurs.list.invalidate();
      toast.success("Commande supprimée");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const sendEmailMutation = trpc.commandesFournisseurs.sendEmail.useMutation({
    onSuccess: () => {
      utils.commandesFournisseurs.list.invalidate();
      toast.success("Bon de commande envoyé par email");
    },
    onError: (err) => toast.error(err.message || "Erreur lors de l'envoi"),
  });

  const handleDelete = (id: number) => {
    if (confirm("Supprimer cette commande ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSendEmail = (id: number) => {
    if (confirm("Envoyer le bon de commande par email au fournisseur ?")) {
      sendEmailMutation.mutate({ id });
    }
  };

  const filtered = (commandes || []).filter((c: any) => {
    if (filterStatut !== "tous" && c.statut !== filterStatut) return false;
    if (filterFournisseur !== "tous" && c.fournisseurId.toString() !== filterFournisseur) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.numero?.toLowerCase().includes(q) ||
        c.fournisseurNom?.toLowerCase().includes(q) ||
        c.reference?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bons de commande fournisseurs</h1>
          <p className="text-muted-foreground">Gérez vos commandes auprès de vos fournisseurs</p>
        </div>
        <Button onClick={() => setLocation("/commandes/nouvelle")}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle commande
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les statuts</SelectItem>
            <SelectItem value="brouillon">Brouillon</SelectItem>
            <SelectItem value="envoyee">Envoyée</SelectItem>
            <SelectItem value="confirmee">Confirmée</SelectItem>
            <SelectItem value="livree">Livrée</SelectItem>
            <SelectItem value="annulee">Annulée</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterFournisseur} onValueChange={setFilterFournisseur}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Fournisseur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les fournisseurs</SelectItem>
            {(fournisseurs || []).map((f: any) => (
              <SelectItem key={f.id} value={f.id.toString()}>{f.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="data-table">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Numéro</th>
                <th>Fournisseur</th>
                <th className="whitespace-nowrap">Date</th>
                <th className="whitespace-nowrap">Statut</th>
                <th className="whitespace-nowrap text-right">Total TTC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cmd: any) => (
                <tr key={cmd.id} className="cursor-pointer" onClick={() => setLocation(`/commandes/${cmd.id}/modifier`)}>
                  <td className="font-medium whitespace-nowrap">{cmd.numero || '-'}</td>
                  <td className="whitespace-nowrap">{cmd.fournisseurNom || '-'}</td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {cmd.dateCommande ? format(new Date(cmd.dateCommande), "dd/MM/yyyy") : "-"}
                  </td>
                  <td className="whitespace-nowrap">
                    <Badge className={statusColors[cmd.statut || "brouillon"] || "bg-gray-100"}>
                      {statusLabels[cmd.statut || "brouillon"] || cmd.statut}
                    </Badge>
                  </td>
                  <td className="font-medium text-right whitespace-nowrap">
                    {formatCurrency(cmd.totalTTC || cmd.montantTotal)}
                  </td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setLocation(`/commandes/${cmd.id}/modifier`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Voir / Éditer
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/api/commandes-fournisseurs/${cmd.id}/pdf`} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger PDF
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSendEmail(cmd.id)}>
                          <Mail className="h-4 w-4 mr-2" />
                          Envoyer par email
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(cmd.id)} className="text-destructive">
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
            <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery || filterStatut !== "tous" ? "Aucune commande trouvée" : "Aucune commande"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || filterStatut !== "tous"
                ? "Essayez avec d'autres critères de recherche"
                : "Créez votre premier bon de commande fournisseur"}
            </p>
            {!searchQuery && filterStatut === "tous" && (
              <Button onClick={() => setLocation("/commandes/nouvelle")}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle commande
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
