import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/modern/shared/trpc";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Card, CardContent } from "@/modern/shared/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Label } from "@/modern/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Textarea } from "@/modern/shared/ui/textarea";
import { useLocation, useSearch } from "wouter";
import { Plus, Search, Receipt, MoreHorizontal, Eye, Pencil, Trash2, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/modern/shared/ui/dropdown-menu";
import { Badge } from "@/modern/shared/ui/badge";
import { StatutBadge } from "@/modern/shared/ui/statut-badge";
import { toast } from "sonner";
import { matchSearch } from "@/lib/normalize";
import { format } from "date-fns";
import { exportToCsv, csvDateSuffix } from "@/lib/csvExport";

// Page Factures du FRONT NEUF (`/v2/factures`) — PORT CONFORME de `pages/Factures.tsx`. JSX à
// l'identique (table native + StatutBadge) ; plomberie repointée : primitives `@/modern/shared/ui`,
// tRPC partagé, i18n (namespace `factures`). Libellés via i18n ; couleurs = classes Tailwind.

export default function FacturesPage() {
  const { t } = useTranslation("factures");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"tous" | "facture" | "avoir">("tous");
  // Filtre par statut piloté par l'URL ?filtre= (set par MonAssistant via naviguer_vers).
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
  // Encours impayé du client sélectionné dans le dialogue de création (alerte non bloquante).
  const { data: encoursClient } = trpc.clients.getEncours.useQuery(
    { clientId: parseInt(selectedClientId) },
    { enabled: !!selectedClientId && !isNaN(parseInt(selectedClientId)) }
  );

  const createMutation = trpc.factures.create.useMutation({
    onSuccess: (data) => {
      utils.factures.list.invalidate();
      setIsCreateDialogOpen(false);
      toast.success(t("toastCreated"));
      setLocation(`/factures/${data.id}`);
    },
    onError: () => {
      toast.error(t("toastCreateError"));
    },
  });

  const deleteMutation = trpc.factures.delete.useMutation({
    onSuccess: () => {
      utils.factures.list.invalidate();
      toast.success(t("toastDeleted"));
    },
    onError: (error) => {
      toast.error(error.message || t("toastDeleteError"));
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      toast.error(t("toastSelectClient"));
      return;
    }
    createMutation.mutate({
      clientId: parseInt(selectedClientId),
      ...formData,
    });
  };

  const handleDelete = (id: number, statut: string) => {
    if (statut !== "brouillon") {
      toast.error(t("toastOnlyDraft"));
      return;
    }
    if (confirm(t("confirmDelete"))) {
      deleteMutation.mutate({ id });
    }
  };

  const formatCurrency = (amount: string | number | null) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const clientsMap = new Map((clients || []).map((c: any) => [c.id, c]));

  const filteredFactures = facturesList?.filter((facture: any) => {
    if (typeFilter !== "tous") {
      const docType = facture.typeDocument || "facture";
      if (docType !== typeFilter) return false;
    }
    if (statusFilter === "impayees") {
      if (facture.statut === "payee" || facture.statut === "annulee" || facture.statut === "brouillon") {
        return false;
      }
    } else if (statusFilter === "en_retard") {
      if (facture.statut !== "en_retard") return false;
    } else if (statusFilter === "brouillon") {
      if (facture.statut !== "brouillon") return false;
    }
    if (!searchQuery) return true;
    const client = clientsMap.get(facture.clientId);
    const clientName = client ? `${client.nom} ${client.prenom}` : "";
    return (
      matchSearch(facture.numero, searchQuery) ||
      matchSearch(facture.objet, searchQuery) ||
      matchSearch(clientName, searchQuery)
    );
  });

  const activeStatusLabel = statusFilter !== "all" ? t(`statusFilter_${statusFilter}`, { defaultValue: statusFilter }) : null;

  // Export CSV des factures. Exporte la sélection courante (après filtres type/statut/recherche).
  const handleExportCSV = () => {
    const data = filteredFactures || [];
    if (data.length === 0) {
      toast.error(t("toastNothingToExport"));
      return;
    }
    const headers = [
      t("csvNumero"), t("csvType"), t("csvClient"), t("csvObjet"), t("csvReference"),
      t("csvDate"), t("csvEcheance"), t("csvMontantHT"), t("csvTVA"), t("csvMontantTTC"), t("csvMontantPaye"), t("csvStatut"),
    ];
    const rows = data.map((f: any) => {
      const client: any = clientsMap.get(f.clientId);
      return [
        f.numero,
        f.typeDocument === "avoir" ? t("csvAvoir") : t("csvFacture"),
        client ? `${client.nom || ""} ${client.prenom || ""}`.trim() : "",
        f.objet,
        f.referenceClient,
        f.dateFacture ? format(new Date(f.dateFacture), "dd/MM/yyyy") : "",
        f.dateEcheance ? format(new Date(f.dateEcheance), "dd/MM/yyyy") : "",
        parseFloat(f.totalHT || "0").toFixed(2),
        parseFloat(f.totalTVA || "0").toFixed(2),
        parseFloat(f.totalTTC || "0").toFixed(2),
        parseFloat(f.montantPaye || "0").toFixed(2),
        t(`statut_${f.statut}`, { defaultValue: f.statut }),
      ];
    });
    exportToCsv(`factures_${csvDateSuffix()}.csv`, headers, rows);
    toast.success(t("toastExported", { count: data.length }));
  };

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            {t("exportCsv")}
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("newFacture")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("newFacture")}</DialogTitle>
              <DialogDescription>
                {t("createDesc")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>{t("clientLabel")}</Label>
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("clientPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((client: any) => (
                        <SelectItem key={client.id} value={String(client.id)}>
                          {client.nom} {client.prenom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Alerte non bloquante « client à risque » : impayés en cours */}
                  {selectedClientId && encoursClient && parseFloat(encoursClient.encoursTotal) > 0 && (
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <span aria-hidden="true">⚠️</span>
                      <span>
                        {t("encoursWarnPre")}{" "}<strong>{formatCurrency(encoursClient.encoursTotal)}</strong>{" "}{t("encoursWarnMid")}
                        {parseFloat(encoursClient.echu) > 0 && (
                          <>{" "}({t("encoursWarnEchuPre")}{" "}<strong>{formatCurrency(encoursClient.echu)}</strong>{" "}{t("encoursWarnEchuPost")})</>
                        )}
                        {" "}{t("encoursWarnSur", { count: encoursClient.nbFacturesImpayees })}
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="objet">{t("objetLabel")}</Label>
                  <Input
                    id="objet"
                    value={formData.objet}
                    onChange={(e) => setFormData({ ...formData, objet: e.target.value })}
                    placeholder={t("objetPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referenceClient">{t("refLabel")}</Label>
                  <Input
                    id="referenceClient"
                    value={formData.referenceClient}
                    onChange={(e) => setFormData({ ...formData, referenceClient: e.target.value })}
                    placeholder={t("refPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateEcheance">{t("echeanceLabel")}</Label>
                  <Input
                    id="dateEcheance"
                    type="date"
                    value={formData.dateEcheance}
                    onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">{t("notesLabel")}</Label>
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
                  {t("cancel", { ns: "common" })}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("creating") : t("createBtn")}
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
            {t("filterActive")} <strong>{activeStatusLabel}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-blue-900 hover:bg-blue-100"
            onClick={() => setLocation("/factures")}
          >
            {t("reset")}
          </Button>
        </div>
      )}

      {/* Visibilité de l'encours : total à encaisser (impayé) calculé à la volée. */}
      {(() => {
        const reelles = (facturesList || []).filter((f: any) => f.typeDocument !== "avoir");
        if (reelles.length === 0) return null;
        const reste = (f: any) => Math.max(0, (parseFloat(f.totalTTC || "0") || 0) - (parseFloat(f.montantPaye || "0") || 0));
        const impayees = reelles.filter((f: any) => f.statut === "envoyee" || f.statut === "en_retard" || f.statut === "validee");
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
                <p className="text-sm text-muted-foreground">{t("statToCollect")}</p>
                <p className="text-2xl font-bold">{formatCurrency(totalImpaye)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{t("statOverdue")}</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalEnRetard)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{t("statUnpaidCount")}</p>
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
            placeholder={t("searchPlaceholder")}
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
            <SelectItem value="tous">{t("typeAll")}</SelectItem>
            <SelectItem value="facture">{t("typeFactures")}</SelectItem>
            <SelectItem value="avoir">{t("typeAvoirs")}</SelectItem>
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
                <th className="whitespace-nowrap">{t("thType")}</th>
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
              {filteredFactures.map((facture: any) => {
                const client = clientsMap.get(facture.clientId);
                const isAvoir = facture.typeDocument === "avoir";
                const isBrouillon = facture.statut === "brouillon";
                return (
                  <tr key={facture.id} className="cursor-pointer" onClick={() => setLocation(`/factures/${facture.id}`)}>
                    <td className="whitespace-nowrap">
                      {isAvoir ? (
                        <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">{t("badgeAvoir")}</Badge>
                      ) : (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">{t("badgeFacture")}</Badge>
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
                            {t("voir")}
                          </DropdownMenuItem>
                          {isBrouillon && (
                            <DropdownMenuItem onClick={() => setLocation(`/factures/${facture.id}`)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              {t("modifier")}
                            </DropdownMenuItem>
                          )}
                          {isBrouillon ? (
                            <DropdownMenuItem
                              onClick={() => handleDelete(facture.id, facture.statut)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t("supprimer")}
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
              {searchQuery ? t("emptyFiltered") : t("emptyNone")}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery
                ? t("emptyFilteredHint")
                : t("emptyNoneHint")}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t("createFacture")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
