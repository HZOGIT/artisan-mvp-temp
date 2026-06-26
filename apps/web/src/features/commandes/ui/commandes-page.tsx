import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCommandes } from "../application/use-commandes";
import { apiUrl } from "@/shared/backend-url";
import {
  filterCommandes,
  isCommandeStatut,
  STATUT_KEYS,
  type Commande,
} from "../domain/commande";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { useLocation, useSearch } from "@/shared/router/navigation";
import { Plus, Search, ShoppingCart, MoreHorizontal, Eye, Pencil, Trash2, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

/*
 * Page Bons de commande fournisseurs du FRONT NEUF (`/commandes`) — clean-archi : présentation pure.
 * Données & mutations via `useCommandes` (couche application, seule à importer tRPC) ; filtrage via le
 * domaine (`../domain/commande`, fonctions pures testées). Parité visuelle stricte : JSX/Tailwind à
 * l'identique (table native + Badge statut). Libellés via i18n (namespace `commandes`).
 */

const statusColors: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  envoyee: "bg-blue-100 text-blue-700",
  confirmee: "bg-orange-100 text-orange-700",
  livree: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
};

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : value || 0;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number.isFinite(num) ? num : 0);
}

export default function CommandesPage() {
  const { t } = useTranslation("commandes");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatut, setFilterStatut] = useState("tous");
  const [filterFournisseur, setFilterFournisseur] = useState("tous");
  useEffect(() => {
    const f = new URLSearchParams(search).get("filtre");
    if (f && isCommandeStatut(f)) {
      setFilterStatut(f);
    } else if (!f) {
      setFilterStatut("tous");
    }
  }, [search]);

  const { commandes, fournisseurs, isLoading, remove: deleteMutation, sendEmail: sendEmailMutation } = useCommandes();

  const handleDelete = (id: number) => {
    if (confirm(t("confirmDelete"))) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => toast.success(t("toastDeleted")),
          onError: () => toast.error(t("toastDeleteError")),
        },
      );
    }
  };

  const handleSendEmail = (id: number) => {
    if (confirm(t("confirmEmail"))) {
      sendEmailMutation.mutate(
        { id },
        {
          onSuccess: () => toast.success(t("toastEmailSent")),
          onError: (err) => toast.error(err.message || t("toastEmailError")),
        },
      );
    }
  };

  /** Le nom fournisseur n'est pas dans le DTO des commandes → résolu via la liste des fournisseurs. */
  const fournisseurNomById = new Map<number, string>(fournisseurs.map((f) => [f.id, f.nom]));
  const resolveFournisseurNom = (id: number | null) => (id == null ? "" : fournisseurNomById.get(id) ?? "");

  /** Filtrage délégué au domaine (pur, testé). */
  const filtered = filterCommandes(commandes, { filterStatut, filterFournisseur, searchQuery, resolveFournisseurNom });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setLocation("/commandes/nouvelle")}>
          <Plus className="h-4 w-4 mr-2" />
          {t("newCommande")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("statutPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">{t("allStatuts")}</SelectItem>
            {STATUT_KEYS.map((k) => (
              <SelectItem key={k} value={k}>{t(`statut_${k}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterFournisseur} onValueChange={setFilterFournisseur}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("fournisseurPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">{t("allFournisseurs")}</SelectItem>
            {fournisseurs.map((f) => (
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
                <th className="whitespace-nowrap">{t("thNumero")}</th>
                <th>{t("thFournisseur")}</th>
                <th className="whitespace-nowrap">{t("thDate")}</th>
                <th className="whitespace-nowrap">{t("thStatut")}</th>
                <th className="whitespace-nowrap text-right">{t("thTotalTTC")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cmd: Commande) => (
                <tr key={cmd.id} className="cursor-pointer" onClick={() => setLocation(`/commandes/${cmd.id}`)}>
                  <td className="font-medium whitespace-nowrap">{cmd.numero || '-'}</td>
                  <td className="whitespace-nowrap">{resolveFournisseurNom(cmd.fournisseurId) || '-'}</td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {cmd.dateCommande ? format(new Date(cmd.dateCommande), "dd/MM/yyyy") : "-"}
                  </td>
                  <td className="whitespace-nowrap">
                    <Badge className={statusColors[cmd.statut || "brouillon"] || "bg-gray-100"}>
                      {t(`statut_${cmd.statut || "brouillon"}`, { defaultValue: cmd.statut })}
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
                        <DropdownMenuItem onClick={() => setLocation(`/commandes/${cmd.id}`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          {t("voir")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation(`/commandes/${cmd.id}/modifier`)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          {t("modifier")}
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={apiUrl(`/api/commandes-fournisseurs/${cmd.id}/pdf`)} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-2" />
                            {t("downloadPdf")}
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSendEmail(cmd.id)}>
                          <Mail className="h-4 w-4 mr-2" />
                          {t("sendEmail")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(cmd.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t("supprimer")}
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
              {searchQuery || filterStatut !== "tous" ? t("emptyFiltered") : t("emptyNone")}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || filterStatut !== "tous"
                ? t("emptyFilteredHint")
                : t("emptyNoneHint")}
            </p>
            {!searchQuery && filterStatut === "tous" && (
              <Button onClick={() => setLocation("/commandes/nouvelle")}>
                <Plus className="h-4 w-4 mr-2" />
                {t("newCommande")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
