import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInterventions, useEquipe } from "../application/use-interventions";
import {
  availableTechniciens,
  buildAdresse,
  dureeDescriptor,
  dureeReelleMinutes,
  filterInterventions,
  groupEquipeByIntervention,
  membreName,
  toInterventionStatut,
  type EquipeByArtisanRow,
  type EquipeMembre,
  type Intervention,
  type InterventionStatut,
  type Technicien,
} from "../domain/intervention";
import { Button } from "@/modern/shared/ui/button";
import { Input } from "@/modern/shared/ui/input";
import { Card, CardContent } from "@/modern/shared/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/modern/shared/ui/dialog";
import { Label } from "@/modern/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Textarea } from "@/modern/shared/ui/textarea";
import { useLocation, useSearch } from "@/modern/shared/router/navigation";
import { Plus, Search, Calendar, MoreHorizontal, Pencil, Trash2, FileDown, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/modern/shared/ui/dropdown-menu";
import { Badge } from "@/modern/shared/ui/badge";
import { StatutBadge } from "@/modern/shared/ui/statut-badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// Page Interventions du FRONT NEUF (`/v2/interventions`) — clean-archi : présentation pure. Données &
// mutations via `useInterventions`/`useEquipe` (couche application, seule à importer tRPC) ; filtrage,
// indexation d'équipe, durée, adresse, statuts via le domaine (`../domain/intervention`, fonctions pures
// testées). Parité visuelle stricte : JSX/Tailwind inchangés (table native + StatutBadge + dialogs +
// gestion d'équipe). Libellés via i18n (namespace `interventions`).

export default function InterventionsPage() {
  const { t } = useTranslation("interventions");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  useEffect(() => {
    const params = new URLSearchParams(search);
    const f = params.get("filtre");
    if (f === "planifiee" || f === "en_cours" || f === "terminee") {
      setStatusFilter(f);
    } else if (!f) {
      setStatusFilter("all");
    }
  }, [search]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [formData, setFormData] = useState<{
    titre: string;
    description: string;
    dateDebut: string;
    dateFin: string;
    adresse: string;
    statut: InterventionStatut;
  }>({
    titre: "",
    description: "",
    dateDebut: "",
    dateFin: "",
    adresse: "",
    statut: "planifiee",
  });

  const {
    interventions: interventionsList,
    clients,
    techniciens: techniciensList,
    equipesByArtisan,
    isLoading,
    create: createMutation,
    update: updateMutation,
    remove: deleteMutation,
  } = useInterventions();

  // Index PUR interventionId → membres (évite le N+1).
  const equipeParIntervention = groupEquipeByIntervention(equipesByArtisan);

  const [membreToAdd, setMembreToAdd] = useState<string>("");
  const { equipe, addMembre: addMembreMutation, removeMembre: removeMembreMutation } = useEquipe(
    selectedIntervention?.id ?? 0,
    isEditDialogOpen && !!selectedIntervention?.id,
  );

  const resetForm = () => {
    setFormData({
      titre: "",
      description: "",
      dateDebut: "",
      dateFin: "",
      adresse: "",
      statut: "planifiee",
    });
    setSelectedClientId("");
  };

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((c) => c.id === parseInt(clientId));
    const adresse = buildAdresse(client);
    if (adresse) {
      setFormData((prev) => ({ ...prev, adresse }));
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !formData.titre) {
      toast.error(t("toastRequiredFields"));
      return;
    }
    createMutation.mutate(
      { clientId: parseInt(selectedClientId), ...formData },
      {
        onSuccess: () => {
          setIsCreateDialogOpen(false);
          resetForm();
          toast.success(t("toastCreated"));
        },
        onError: () => toast.error(t("toastCreateError")),
      },
    );
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntervention) return;
    updateMutation.mutate(
      { id: selectedIntervention.id, ...formData },
      {
        onSuccess: () => {
          setIsEditDialogOpen(false);
          toast.success(t("toastUpdated"));
        },
        onError: () => toast.error(t("toastUpdateError")),
      },
    );
  };

  const handleEdit = (intervention: Intervention) => {
    setSelectedIntervention(intervention);
    setFormData({
      titre: intervention.titre || "",
      description: intervention.description || "",
      dateDebut: intervention.dateDebut ? format(new Date(intervention.dateDebut), "yyyy-MM-dd'T'HH:mm") : "",
      dateFin: intervention.dateFin ? format(new Date(intervention.dateFin), "yyyy-MM-dd'T'HH:mm") : "",
      adresse: intervention.adresse || "",
      statut: toInterventionStatut(intervention.statut),
    });
    setIsEditDialogOpen(true);
  };

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

  const filteredInterventions = filterInterventions(interventionsList, { statusFilter, searchQuery });

  const activeStatusLabel =
    statusFilter !== "all" ? t(`statut_${statusFilter}`, { defaultValue: statusFilter }) : null;

  // Nom du membre via le domaine + fallback i18n côté présentation.
  const nomMembre = (m: { prenom?: string | null; nom?: string | null; technicienId: number }) =>
    membreName(m) || t("techNum", { id: m.technicienId });

  const dureeLabel = (min: number | null | undefined) => {
    const d = dureeDescriptor(min);
    if (d.kind === "none") return "-";
    if (d.kind === "hm") return t("durationHM", { h: d.h, mm: d.mm });
    return t("durationMin", { m: d.m });
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
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              {t("newInter")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("newInter")}</DialogTitle>
              <DialogDescription>
                {t("createDesc")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>{t("clientLabel")}</Label>
                  <Select value={selectedClientId} onValueChange={handleClientChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("clientPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={String(client.id)}>
                          {client.nom} {client.prenom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="titre">{t("titreLabel")}</Label>
                  <Input
                    id="titre"
                    value={formData.titre}
                    onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                    placeholder={t("titrePlaceholder")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adresse">{t("adresseLabel")}</Label>
                  <Input
                    id="adresse"
                    value={formData.adresse}
                    onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                    placeholder={t("adressePlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateDebut">{t("dateDebutLabel")}</Label>
                    <Input
                      id="dateDebut"
                      type="datetime-local"
                      value={formData.dateDebut}
                      onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateFin">{t("dateFinLabel")}</Label>
                    <Input
                      id="dateFin"
                      type="datetime-local"
                      value={formData.dateFin}
                      onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{t("descLabel")}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {t("cancel", { ns: "common" })}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("creating") : t("create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-titre">{t("titreLabel")}</Label>
                <Input
                  id="edit-titre"
                  value={formData.titre}
                  onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-adresse">{t("adresseLabel")}</Label>
                <Input
                  id="edit-adresse"
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-dateDebut">{t("dateDebutLabel")}</Label>
                  <Input
                    id="edit-dateDebut"
                    type="datetime-local"
                    value={formData.dateDebut}
                    onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-dateFin">{t("dateFinLabel")}</Label>
                  <Input
                    id="edit-dateFin"
                    type="datetime-local"
                    value={formData.dateFin}
                    onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("statutLabel")}</Label>
                <Select value={formData.statut} onValueChange={(v) => setFormData({ ...formData, statut: toInterventionStatut(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planifiee">{t("statut_planifiee")}</SelectItem>
                    <SelectItem value="en_cours">{t("statut_en_cours")}</SelectItem>
                    <SelectItem value="terminee">{t("statut_terminee")}</SelectItem>
                    <SelectItem value="annulee">{t("statut_annulee")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">{t("descLabel")}</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              {/* Équipe : intervenants supplémentaires (binôme, aide…) */}
              <div className="space-y-2">
                <Label>{t("equipeLabel")}</Label>
                {equipe.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {equipe.map((m: EquipeMembre) => (
                      <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
                        {nomMembre(m)}
                        {m.role ? <span className="text-[10px] opacity-70">({m.role})</span> : null}
                        <button
                          type="button"
                          aria-label={t("removeAria")}
                          className="ml-0.5 rounded hover:bg-muted-foreground/20"
                          onClick={() =>
                            removeMembreMutation.mutate(
                              { id: m.id },
                              {
                                onSuccess: () => toast.success(t("toastMemberRemoved")),
                                onError: (e) => toast.error(e.message),
                              },
                            )
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("equipeEmpty")}</p>
                )}
                <div className="flex gap-2">
                  <Select value={membreToAdd} onValueChange={setMembreToAdd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t("addTechPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTechniciens(techniciensList, equipe).map((tech: Technicien) => (
                        <SelectItem key={tech.id} value={String(tech.id)}>
                          {membreName(tech) || t("techNum", { id: tech.id })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!membreToAdd || !selectedIntervention?.id || addMembreMutation.isPending}
                    onClick={() =>
                      selectedIntervention?.id &&
                      membreToAdd &&
                      addMembreMutation.mutate(
                        {
                          interventionId: selectedIntervention.id,
                          technicienId: parseInt(membreToAdd),
                        },
                        {
                          onSuccess: () => {
                            setMembreToAdd("");
                            toast.success(t("toastMemberAdded"));
                          },
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                  >
                    {t("add")}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                {t("cancel", { ns: "common" })}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("updating") : t("update")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {activeStatusLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span>
            {t("filterActive")} <strong>{activeStatusLabel}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-9 px-3 min-h-[36px] text-blue-900 hover:bg-blue-100"
            onClick={() => setLocation("/interventions")}
          >
            {t("reset")}
          </Button>
        </div>
      )}

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

      {/* Interventions List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredInterventions && filteredInterventions.length > 0 ? (
        <div className="bg-card rounded-lg border border-border overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("thTitre")}</th>
                <th className="whitespace-nowrap">{t("thDate")}</th>
                <th className="whitespace-nowrap">{t("thStatut")}</th>
                <th className="whitespace-nowrap">{t("thDuree")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredInterventions.map((intervention: Intervention) => (
                <tr key={intervention.id}>
                  <td className="font-medium">
                    {intervention.titre}
                    {/* équipe (intervenants additionnels) */}
                    {(equipeParIntervention.get(intervention.id)?.length ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(equipeParIntervention.get(intervention.id) ?? []).map((m: EquipeByArtisanRow) => (
                          <Badge key={m.technicienId} variant="secondary" className="text-[10px] font-normal gap-1">
                            <Users className="h-2.5 w-2.5" />
                            {membreName(m) || t("techShort", { id: m.technicienId })}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {intervention.dateDebut
                      ? format(new Date(intervention.dateDebut), "dd/MM/yyyy HH:mm", { locale: fr })
                      : "-"}
                  </td>
                  <td className="whitespace-nowrap">
                    <StatutBadge statut={intervention.statut || 'planifiee'} />
                  </td>
                  {/* durée réelle sur site captée par l'app mobile (arrivée→départ) */}
                  <td className="whitespace-nowrap text-muted-foreground">
                    {dureeLabel(dureeReelleMinutes(intervention))}
                  </td>
                  <td className="whitespace-nowrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(intervention)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          {t("modifier")}
                        </DropdownMenuItem>
                        {/* bon d'intervention signé (disponible dès qu'elle est terminée) */}
                        {intervention.statut === "terminee" && (
                          <DropdownMenuItem asChild>
                            <a
                              href={`/api/interventions/${intervention.id}/bon-pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileDown className="h-4 w-4 mr-2" />
                              {t("bonInter")}
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDelete(intervention.id)}
                          className="text-destructive"
                        >
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
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
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
                {t("planInter")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
