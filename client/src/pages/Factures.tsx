import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useSearch } from "wouter";
import { Plus, Search, Receipt, MoreHorizontal, Eye, Pencil, Trash2, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { StatutBadge } from "@/components/StatutBadge";
import { toast } from "sonner";
import { matchSearch } from "@/lib/normalize";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { exportToCsv, csvDateSuffix } from "@/lib/csvExport";

const statusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  validee: "Validée",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  validee: "bg-amber-100 text-amber-800",
  envoyee: "bg-blue-100 text-blue-700",
  payee: "bg-green-100 text-green-700",
  en_retard: "bg-orange-100 text-orange-700",
  annulee: "bg-red-100 text-red-700",
};

export default function Factures() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"tous" | "facture" | "avoir">("tous");
  // Filtre par statut piloté par l'URL ?filtre= (set par MonAssistant via naviguer_vers).
  // "impayees" couvre les statuts non finaux : envoyee + en_retard + validee.
  const [statusFilter, setStatusFilter] = useState<string>("all");
  useEffect(() => {
    const params = new URLSearchParams(search);
    const f = params.get("filtre");
    if (f === "impayees" || f === "en_retard" || f === "brouillon") {
      setStatusFilter(f);
    } else if (!f) {
      setStatusFilter("all");
    }
  }, [search]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [formData, setFormData] = useState({
    objet: "",
    referenceClient: "",
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
      toast.success("Brouillon supprimé avec succès");
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de la suppression");
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

  const handleDelete = (id: number, statut: string) => {
    if (statut !== "brouillon") {
      toast.error("Seuls les brouillons peuvent être supprimés (conformité fiscale)");
      return;
    }
    if (confirm("Êtes-vous sûr de vouloir supprimer ce brouillon ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const clientsMap = new Map((clients || []).map((c: any) => [c.id, c]));

  const filteredFactures = facturesList?.filter((facture: any) => {
    // Filtre par type
    if (typeFilter !== "tous") {
      const docType = facture.typeDocument || "facture";
      if (docType !== typeFilter) return false;
    }

    // Filtre par statut (depuis l'URL ?filtre=)
    if (statusFilter === "impayees") {
      // Tout ce qui n'est ni payé, ni annulé, ni brouillon
      if (facture.statut === "payee" || facture.statut === "annulee" || facture.statut === "brouillon") {
        return false;
      }
    } else if (statusFilter === "en_retard") {
      if (facture.statut !== "en_retard") return false;
    } else if (statusFilter === "brouillon") {
      if (facture.statut !== "brouillon") return false;
    }

    // Filtre par recherche — insensible aux accents et a la casse.
    if (!searchQuery) return true;
    const client = clientsMap.get(facture.clientId);
    const clientName = client ? `${client.nom} ${client.prenom}` : "";
    return (
      matchSearch(facture.numero, searchQuery) ||
      matchSearch(facture.objet, searchQuery) ||
      matchSearch(clientName, searchQuery)
    );
  });

  const statusFilterLabel: Record<string, string> = {
    impayees: "impayées",
    en_retard: "en retard",
    brouillon: "brouillons",
  };
  const activeStatusLabel = statusFilter !== "all" ? statusFilterLabel[statusFilter] : null;

  // Export CSV des factures (portabilité RGPD — OPE-175). Exporte la sélection
  // courante (après filtres type/statut/recherche). Devis a déjà son export Excel.
  const handleExportCSV = () => {
    const data = filteredFactures || [];
    if (data.length === 0) {
      toast.error("Aucune facture à exporter");
      return;
    }
    const headers = [
      "Numéro", "Type", "Client", "Objet", "Référence client",
      "Date", "Échéance", "Montant HT", "TVA", "Montant TTC", "Montant payé", "Statut",
    ];
    const rows = data.map((f: any) => {
      const client: any = clientsMap.get(f.clientId);
      return [
        f.numero,
        f.typeDocument === "avoir" ? "Avoir" : "Facture",
        client ? `${client.nom || ""} ${client.prenom || ""}`.trim() : "",
        f.objet,
        f.referenceClient,
        f.dateFacture ? format(new Date(f.dateFacture), "dd/MM/yyyy") : "",
        f.dateEcheance ? format(new Date(f.dateEcheance), "dd/MM/yyyy") : "",
        parseFloat(f.totalHT || "0").toFixed(2),
        parseFloat(f.totalTVA || "0").toFixed(2),
        parseFloat(f.totalTTC || "0").toFixed(2),
        parseFloat(f.montantPaye || "0").toFixed(2),
        statusLabels[f.statut] || f.statut,
      ];
    });
    exportToCsv(`factures_${csvDateSuffix()}.csv`, headers, rows);
    toast.success(`${data.length} facture(s) exportée(s)`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Factures</h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos factures et avoirs clients
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exporter (CSV)
          </Button>
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
                  <Label htmlFor="referenceClient">Référence client / N° de commande</Label>
                  <Input
                    id="referenceClient"
                    value={formData.referenceClient}
                    onChange={(e) => setFormData({ ...formData, referenceClient: e.target.value })}
                    placeholder="Ex: BC-2026-0042 (optionnel, pour les clients pros)"
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
      </div>

      {activeStatusLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span>
            Filtre actif : <strong>{activeStatusLabel}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-blue-900 hover:bg-blue-100"
            onClick={() => setLocation("/factures")}
          >
            Réinitialiser
          </Button>
        </div>
      )}

      {/* OPE-144 — visibilité de l'encours : total à encaisser (impayé) calculé à la volée
          depuis la liste déjà chargée. Exclut avoirs / brouillons / payées / annulées ;
          retire le montant déjà payé. Lecture seule, aucun backend. */}
      {(() => {
        const reelles = (facturesList || []).filter((f: any) => f.typeDocument !== "avoir");
        if (reelles.length === 0) return null;
        const reste = (f: any) => Math.max(0, (parseFloat(f.totalTTC || "0") || 0) - (parseFloat(f.montantPaye || "0") || 0));
        const impayees = reelles.filter((f: any) => f.statut === "envoyee" || f.statut === "en_retard" || f.statut === "validee");
        // OPE-247 — les avoirs validés (notes de crédit, totalTTC négatif) réduisent le
        // « à encaisser » : sans cette déduction, l'impayé est sur-évalué dès qu'un avoir existe.
        const creditAvoirs = (facturesList || [])
          .filter((f: any) => f.typeDocument === "avoir" && f.statut !== "annulee" && f.statut !== "brouillon")
          .reduce((s: number, f: any) => s + Math.abs(parseFloat(f.totalTTC || "0") || 0), 0);
        const totalImpaye = Math.max(0, impayees.reduce((s: number, f: any) => s + reste(f), 0) - creditAvoirs);
        const totalEnRetard = Math.min(
          reelles.filter((f: any) => f.statut === "en_retard").reduce((s: number, f: any) => s + reste(f), 0),
          totalImpaye,
        );
        return (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">À encaisser (impayé)</p>
                <p className="text-2xl font-bold">{formatCurrency(totalImpaye)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Dont en retard</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalEnRetard)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Factures impayées</p>
                <p className="text-2xl font-bold">{impayees.length}</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une facture..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les documents</SelectItem>
            <SelectItem value="facture">Factures uniquement</SelectItem>
            <SelectItem value="avoir">Avoirs uniquement</SelectItem>
          </SelectContent>
        </Select>
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
                <th className="whitespace-nowrap">Type</th>
                <th className="whitespace-nowrap">Numéro</th>
                <th className="whitespace-nowrap">Date</th>
                <th>Client</th>
                <th>Objet</th>
                <th className="whitespace-nowrap text-right">Montant TTC</th>
                <th className="whitespace-nowrap">Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredFactures.map((facture: any) => {
                const client = clientsMap.get(facture.clientId);
                const isAvoir = facture.typeDocument === "avoir";
                const isBrouillon = facture.statut === "brouillon";
                return (
                  <tr key={facture.id} className="cursor-pointer" onClick={() => setLocation(`/factures/${facture.id}`)}>
                    <td className="whitespace-nowrap">
                      {isAvoir ? (
                        <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">AVOIR</Badge>
                      ) : (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">FACTURE</Badge>
                      )}
                    </td>
                    <td className="font-medium whitespace-nowrap">{facture.numero}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{facture.dateFacture ? format(new Date(facture.dateFacture), "dd/MM/yyyy") : "-"}</td>
                    <td className="whitespace-nowrap">{client ? `${client.nom} ${client.prenom || ''}`.trim() : "-"}</td>
                    <td className="max-w-[200px] truncate">{facture.objet || "-"}</td>
                    <td className={`font-medium text-right whitespace-nowrap ${isAvoir ? "text-red-600" : ""}`}>{formatCurrency(facture.totalTTC)}</td>
                    <td className="whitespace-nowrap">
                      <StatutBadge statut={facture.statut || 'brouillon'} />
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
                          {isBrouillon && (
                            <DropdownMenuItem onClick={() => setLocation(`/factures/${facture.id}`)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                          )}
                          {isBrouillon ? (
                            <DropdownMenuItem
                              onClick={() => handleDelete(facture.id, facture.statut)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          ) : null}
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
