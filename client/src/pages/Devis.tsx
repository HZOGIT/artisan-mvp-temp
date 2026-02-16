import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Plus, Search, FileText, MoreHorizontal, Eye, Pencil, Trash2, Receipt, Download, FileSpreadsheet } from "lucide-react";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const utils = trpc.useUtils();
  const { data: devisList, isLoading } = trpc.devis.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const deleteMutation = trpc.devis.delete.useMutation({
    onSuccess: () => {
      utils.devis.list.invalidate();
      toast.success("Devis supprimé avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression du devis");
    },
  });

  const convertToFactureMutation = trpc.devis.convertToFacture.useMutation({
    onSuccess: (data) => {
      utils.devis.list.invalidate();
      utils.factures.list.invalidate();
      toast.success("Devis converti en facture avec succès");
      setLocation(`/factures/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message || "Erreur lors de la conversion en facture");
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce devis ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleConvertToFacture = (devisId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Voulez-vous convertir ce devis en facture ?")) {
      convertToFactureMutation.mutate({ devisId });
    }
  };

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  // Export PDF
  const exportToPDF = () => {
    if (!filteredDevis || filteredDevis.length === 0) {
      toast.error("Aucun devis à exporter");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Titre
    doc.setFontSize(18);
    doc.text("Liste des Devis", pageWidth / 2, 20, { align: "center" });
    
    // Filtre actif
    doc.setFontSize(10);
    const filterText = statusFilter === "all" ? "Tous les statuts" : statusLabels[statusFilter];
    doc.text(`Filtre: ${filterText} | ${filteredDevis.length} devis`, pageWidth / 2, 28, { align: "center" });
    doc.text(`Exporté le ${format(new Date(), "dd/MM/yyyy à HH:mm", { locale: fr })}`, pageWidth / 2, 34, { align: "center" });

    // En-têtes du tableau
    let y = 45;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Numéro", 14, y);
    doc.text("Client", 45, y);
    doc.text("Date", 90, y);
    doc.text("Objet", 115, y);
    doc.text("Montant TTC", 160, y);
    doc.text("Statut", 185, y);
    
    // Ligne de séparation
    y += 3;
    doc.line(14, y, 200, y);
    y += 5;

    // Données
    doc.setFont("helvetica", "normal");
    filteredDevis.forEach((devis: any) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      const client = clientsMap.get(devis.clientId);
      const clientName = client ? `${client.nom} ${client.prenom}`.substring(0, 20) : "-";
      const objet = (devis.objet || "-").substring(0, 25);
      
      doc.text(devis.numero || "-", 14, y);
      doc.text(clientName, 45, y);
      doc.text(devis.dateDevis ? format(new Date(devis.dateDevis), "dd/MM/yyyy") : "-", 90, y);
      doc.text(objet, 115, y);
      doc.text(formatCurrency(devis.totalTTC).replace("\u00a0", " "), 160, y);
      doc.text(statusLabels[devis.statut] || devis.statut, 185, y);
      y += 7;
    });

    doc.save(`devis_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("Export PDF téléchargé");
  };

  // Export Excel
  const exportToExcel = () => {
    if (!filteredDevis || filteredDevis.length === 0) {
      toast.error("Aucun devis à exporter");
      return;
    }

    const data = filteredDevis.map((devis: any) => {
      const client = clientsMap.get(devis.clientId);
      return {
        "Numéro": devis.numero || "-",
        "Client": client ? `${client.nom} ${client.prenom}` : "-",
        "Date": devis.dateDevis ? format(new Date(devis.dateDevis), "dd/MM/yyyy") : "-",
        "Objet": devis.objet || "-",
        "Montant HT": parseFloat(devis.totalHT || "0"),
        "TVA": parseFloat(devis.totalTVA || "0"),
        "Montant TTC": parseFloat(devis.totalTTC || "0"),
        "Statut": statusLabels[devis.statut] || devis.statut,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Devis");
    
    // Ajuster la largeur des colonnes
    ws["!cols"] = [
      { wch: 15 }, // Numéro
      { wch: 25 }, // Client
      { wch: 12 }, // Date
      { wch: 35 }, // Objet
      { wch: 12 }, // Montant HT
      { wch: 10 }, // TVA
      { wch: 12 }, // Montant TTC
      { wch: 12 }, // Statut
    ];

    XLSX.writeFile(wb, `devis_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Export Excel téléchargé");
  };

  // Créer un mapping client pour la recherche par nom
  const clientsMap = new Map<number, { nom: string; prenom: string }>();
  clients?.forEach((client: any) => {
    clientsMap.set(client.id, { nom: client.nom, prenom: client.prenom || "" });
  });

  const filteredDevis = devisList?.filter((devis: any) => {
    // Filtre par statut
    if (statusFilter !== "all" && devis.statut !== statusFilter) {
      return false;
    }
    
    // Filtre par recherche (numéro, objet, ou nom du client)
    const searchLower = searchQuery.toLowerCase();
    if (searchLower) {
      const client = clientsMap.get(devis.clientId);
      const clientName = client ? `${client.nom} ${client.prenom}`.toLowerCase() : "";
      
      return (
        devis.numero?.toLowerCase().includes(searchLower) ||
        devis.objet?.toLowerCase().includes(searchLower) ||
        clientName.includes(searchLower)
      );
    }
    
    return true;
  });

  // Compter les devis par statut
  const statusCounts = devisList?.reduce((acc: Record<string, number>, devis: any) => {
    acc[devis.statut] = (acc[devis.statut] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

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
        <Button onClick={() => setLocation("/devis/nouveau")}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau devis
        </Button>
      </div>

      {/* Filtres par statut et exports */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            Tous ({devisList?.length || 0})
          </Button>
          {Object.entries(statusLabels).map(([key, label]) => (
            <Button
              key={key}
              variant={statusFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(key)}
              className={statusFilter === key ? "" : statusColors[key]}
            >
              {label} ({statusCounts[key] || 0})
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToPDF}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par numéro, objet ou nom de client..."
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
        <div className="bg-card rounded-lg border border-border overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
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
              {filteredDevis.map((devis: any) => {
                const client = clientsMap.get(devis.clientId);
                return (
                  <tr key={devis.id} className="cursor-pointer" onClick={() => setLocation(`/devis/${devis.id}`)}>
                    <td className="font-medium whitespace-nowrap">{devis.numero}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{devis.dateDevis ? format(new Date(devis.dateDevis), "dd/MM/yyyy") : "-"}</td>
                    <td className="whitespace-nowrap">{client ? `${client.nom} ${client.prenom}` : "-"}</td>
                    <td className="max-w-[200px] truncate">{devis.objet || "-"}</td>
                    <td className="font-medium text-right whitespace-nowrap">{formatCurrency(devis.totalTTC)}</td>
                    <td className="whitespace-nowrap">
                      <Badge className={statusColors[devis.statut] || "bg-gray-100"}>
                        {statusLabels[devis.statut] || devis.statut}
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
                          <DropdownMenuItem onClick={() => setLocation(`/devis/${devis.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Voir
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation(`/devis/${devis.id}`)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          {devis.statut === "accepte" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => handleConvertToFacture(devis.id, e)}
                                className="text-green-600"
                              >
                                <Receipt className="h-4 w-4 mr-2" />
                                Convertir en facture
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
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
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery || statusFilter !== "all" ? "Aucun devis trouvé" : "Aucun devis"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== "all"
                ? "Essayez avec d'autres critères de recherche ou filtres"
                : "Commencez par créer votre premier devis"}
            </p>
            {!searchQuery && statusFilter === "all" && (
              <Button onClick={() => setLocation("/devis/nouveau")}>
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
