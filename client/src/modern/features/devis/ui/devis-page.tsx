import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/modern/shared/trpc";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Card, CardContent } from "@/modern/shared/ui/card";
import { StatutBadge } from "@/modern/shared/ui/statut-badge";
import { useLocation, useSearch } from "wouter";
import { Plus, Search, FileText, MoreHorizontal, Eye, Pencil, Trash2, Receipt, Download, FileSpreadsheet } from "lucide-react";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/modern/shared/ui/dropdown-menu";
import { toast } from "sonner";
import { matchSearch } from "@/lib/normalize";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// Page Devis du FRONT NEUF (`/v2/devis`) — PORT CONFORME de `pages/Devis.tsx`. JSX/Tailwind à
// l'identique (table native `data-table` conservée) ; plomberie repointée : primitives
// `@/modern/shared/ui` (dont StatutBadge), tRPC partagé, i18n (namespace `devis`). Couleurs de filtres
// par statut conservées (classes Tailwind) ; libellés via i18n.

const STATUT_KEYS = ["brouillon", "envoye", "accepte", "refuse", "expire"];

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoye: "bg-blue-100 text-blue-700",
  accepte: "bg-green-100 text-green-700",
  refuse: "bg-red-100 text-red-700",
  expire: "bg-orange-100 text-orange-700",
};

export default function DevisPage() {
  const { t } = useTranslation("devis");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Lecture du filtre ?filtre= défini par MonAssistant (naviguer_vers).
  useEffect(() => {
    const params = new URLSearchParams(search);
    const f = params.get("filtre");
    if (f && STATUT_KEYS.includes(f)) {
      setStatusFilter(f);
    }
  }, [search]);
  const utils = trpc.useUtils();
  const { data: devisList, isLoading } = trpc.devis.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const statutLabelOf = (statut: string) => t(`statut_${statut}`, { defaultValue: statut });

  const deleteMutation = trpc.devis.delete.useMutation({
    onSuccess: () => {
      utils.devis.list.invalidate();
      toast.success(t("toastDeleted"));
    },
    onError: () => {
      toast.error(t("toastDeleteError"));
    },
  });

  const convertToFactureMutation = trpc.devis.convertToFacture.useMutation({
    onSuccess: (data) => {
      utils.devis.list.invalidate();
      utils.factures.list.invalidate();
      toast.success(t("toastConverted"));
      setLocation(`/factures/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message || t("toastConvertError"));
    },
  });

  const handleDelete = (id: number) => {
    if (confirm(t("confirmDelete"))) {
      deleteMutation.mutate({ id });
    }
  };

  const handleConvertToFacture = (devisId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t("confirmConvert"))) {
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
      toast.error(t("toastNothingToExport"));
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text(t("pdfTitle"), pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(10);
    const filterText = statusFilter === "all" ? t("pdfAllStatuts") : statutLabelOf(statusFilter);
    doc.text(t("pdfFiltre", { filter: filterText, n: filteredDevis.length }), pageWidth / 2, 28, { align: "center" });
    doc.text(t("pdfExporte", { date: format(new Date(), "dd/MM/yyyy à HH:mm", { locale: fr }) }), pageWidth / 2, 34, { align: "center" });

    let y = 45;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(t("thNumero"), 14, y);
    doc.text(t("thClient"), 45, y);
    doc.text(t("thDate"), 90, y);
    doc.text(t("thObjet"), 115, y);
    doc.text(t("thMontantTTC"), 160, y);
    doc.text(t("thStatut"), 185, y);

    y += 3;
    doc.line(14, y, 200, y);
    y += 5;

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
      doc.text(formatCurrency(devis.totalTTC).replace(/\u00a0/g, " "), 160, y);
      doc.text(statutLabelOf(devis.statut), 185, y);
      y += 7;
    });

    doc.save(`devis_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success(t("toastPdfDownloaded"));
  };

  // Export Excel
  const exportToExcel = () => {
    if (!filteredDevis || filteredDevis.length === 0) {
      toast.error(t("toastNothingToExport"));
      return;
    }

    const data = filteredDevis.map((devis: any) => {
      const client = clientsMap.get(devis.clientId);
      return {
        [t("thNumero")]: devis.numero || "-",
        [t("thClient")]: client ? `${client.nom} ${client.prenom}` : "-",
        [t("thDate")]: devis.dateDevis ? format(new Date(devis.dateDevis), "dd/MM/yyyy") : "-",
        [t("thObjet")]: devis.objet || "-",
        [t("excelMontantHT")]: parseFloat(devis.totalHT || "0"),
        [t("excelTVA")]: parseFloat(devis.totalTVA || "0"),
        [t("thMontantTTC")]: parseFloat(devis.totalTTC || "0"),
        [t("thStatut")]: statutLabelOf(devis.statut),
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("excelSheet"));

    ws["!cols"] = [
      { wch: 15 },
      { wch: 25 },
      { wch: 12 },
      { wch: 35 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
    ];

    XLSX.writeFile(wb, `devis_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success(t("toastExcelDownloaded"));
  };

  // Créer un mapping client pour la recherche par nom
  const clientsMap = new Map<number, { nom: string; prenom: string }>();
  clients?.forEach((client: any) => {
    clientsMap.set(client.id, { nom: client.nom, prenom: client.prenom || "" });
  });

  const filteredDevis = devisList?.filter((devis: any) => {
    if (statusFilter !== "all" && devis.statut !== statusFilter) {
      return false;
    }
    if (searchQuery) {
      const client = clientsMap.get(devis.clientId);
      const clientName = client ? `${client.nom} ${client.prenom}` : "";
      return (
        matchSearch(devis.numero, searchQuery) ||
        matchSearch(devis.objet, searchQuery) ||
        matchSearch(clientName, searchQuery)
      );
    }
    return true;
  });

  const statusCounts = devisList?.reduce((acc: Record<string, number>, devis: any) => {
    acc[devis.statut] = (acc[devis.statut] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>
        <Button onClick={() => setLocation("/devis/nouveau")}>
          <Plus className="h-4 w-4 mr-2" />
          {t("newDevis")}
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
            {t("filterAll")} ({devisList?.length || 0})
          </Button>
          {STATUT_KEYS.map((key) => (
            <Button
              key={key}
              variant={statusFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(key)}
              className={statusFilter === key ? "" : statusColors[key]}
            >
              {statutLabelOf(key)} ({statusCounts[key] || 0})
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToPDF}>
            <Download className="h-4 w-4 mr-2" />
            {t("exportPdf")}
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {t("exportExcel")}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
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
                <th className="whitespace-nowrap">{t("thNumero")}</th>
                <th className="whitespace-nowrap">{t("thDate")}</th>
                <th>{t("thClient")}</th>
                <th>{t("thObjet")}</th>
                <th className="whitespace-nowrap text-right">{t("thMontantTTC")}</th>
                <th className="whitespace-nowrap">{t("thStatut")}</th>
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
                      <StatutBadge statut={devis.statut} />
                      {/* read-receipt : « vu » par le client (sur devis envoyé) */}
                      {devis.statut === "envoye" && (
                        devis.dateVue ? (
                          <div className="text-xs text-green-600 mt-1">
                            {t("vuLe", { date: format(new Date(devis.dateVue), "dd/MM/yyyy", { locale: fr }) })}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">{t("nonVu")}</div>
                        )
                      )}
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
                            {t("voir")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation(`/devis/${devis.id}`)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            {t("modifier")}
                          </DropdownMenuItem>
                          {devis.statut === "accepte" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => handleConvertToFacture(devis.id, e)}
                                className="text-green-600"
                              >
                                <Receipt className="h-4 w-4 mr-2" />
                                {t("convertir")}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(devis.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t("supprimer")}
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
              {searchQuery || statusFilter !== "all" ? t("emptyFiltered") : t("emptyNone")}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== "all"
                ? t("emptyFilteredHint")
                : t("emptyNoneHint")}
            </p>
            {!searchQuery && statusFilter === "all" && (
              <Button onClick={() => setLocation("/devis/nouveau")}>
                <Plus className="h-4 w-4 mr-2" />
                {t("createDevis")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
