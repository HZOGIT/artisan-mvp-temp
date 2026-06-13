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
import { Plus, Search, Calendar, MoreHorizontal, Eye, Pencil, Trash2, FileDown, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { StatutBadge } from "@/components/StatutBadge";
import { toast } from "sonner";
import { matchSearch } from "@/lib/normalize";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const statusLabels: Record<string, string> = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

const statusColors: Record<string, string> = {
  planifiee: "bg-blue-100 text-blue-700",
  en_cours: "bg-yellow-100 text-yellow-700",
  terminee: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
};

export default function Interventions() {
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
  const [selectedIntervention, setSelectedIntervention] = useState<any>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [formData, setFormData] = useState<{
    titre: string;
    description: string;
    dateDebut: string;
    dateFin: string;
    adresse: string;
    statut: "planifiee" | "en_cours" | "terminee" | "annulee";
  }>({
    titre: "",
    description: "",
    dateDebut: "",
    dateFin: "",
    adresse: "",
    statut: "planifiee",
  });

  const utils = trpc.useUtils();
  const { data: interventionsList, isLoading } = trpc.interventions.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const createMutation = trpc.interventions.create.useMutation({
    onSuccess: () => {
      utils.interventions.list.invalidate();
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success("Intervention créée avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la création de l'intervention");
    },
  });

  const updateMutation = trpc.interventions.update.useMutation({
    onSuccess: () => {
      utils.interventions.list.invalidate();
      setIsEditDialogOpen(false);
      toast.success("Intervention mise à jour");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour");
    },
  });

  const deleteMutation = trpc.interventions.delete.useMutation({
    onSuccess: () => {
      utils.interventions.list.invalidate();
      toast.success("Intervention supprimée");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });

  // OPE-111 — équipe d'intervention (plusieurs intervenants additionnels)
  const { data: techniciensList } = trpc.techniciens.getAll.useQuery();
  // OPE-111 — toutes les équipes (1 requête) → map interventionId → membres, pour
  // afficher l'équipe sur chaque ligne du planning sans N+1.
  const { data: equipesByArtisan } = trpc.interventions.getEquipesByArtisan.useQuery();
  const equipeParIntervention = new Map<number, any[]>();
  for (const m of equipesByArtisan || []) {
    const arr = equipeParIntervention.get(m.interventionId) || [];
    arr.push(m);
    equipeParIntervention.set(m.interventionId, arr);
  }
  const [membreToAdd, setMembreToAdd] = useState<string>("");
  const { data: equipe } = trpc.interventions.getEquipe.useQuery(
    { interventionId: selectedIntervention?.id ?? 0 },
    { enabled: isEditDialogOpen && !!selectedIntervention?.id },
  );
  const addMembreMutation = trpc.interventions.ajouterMembreEquipe.useMutation({
    onSuccess: () => {
      utils.interventions.getEquipe.invalidate();
      setMembreToAdd("");
      toast.success("Membre ajouté à l'équipe");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMembreMutation = trpc.interventions.retirerMembreEquipe.useMutation({
    onSuccess: () => {
      utils.interventions.getEquipe.invalidate();
      toast.success("Membre retiré de l'équipe");
    },
    onError: (e) => toast.error(e.message),
  });

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
    const client = clients?.find((c: any) => c.id === parseInt(clientId));
    if (client?.adresse) {
      const adresse = `${client.adresse}, ${client.codePostal || ""} ${client.ville || ""}`.trim().replace(/,\s*$/, "");
      setFormData((prev) => ({ ...prev, adresse }));
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !formData.titre) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }
    createMutation.mutate({
      clientId: parseInt(selectedClientId),
      ...formData,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntervention) return;
    updateMutation.mutate({
      id: selectedIntervention.id,
      ...formData,
    });
  };

  const handleEdit = (intervention: any) => {
    setSelectedIntervention(intervention);
    setFormData({
      titre: intervention.titre || "",
      description: intervention.description || "",
      dateDebut: intervention.dateDebut ? format(new Date(intervention.dateDebut), "yyyy-MM-dd'T'HH:mm") : "",
      dateFin: intervention.dateFin ? format(new Date(intervention.dateFin), "yyyy-MM-dd'T'HH:mm") : "",
      adresse: intervention.adresse || "",
      statut: intervention.statut || "planifiee",
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette intervention ?")) {
      deleteMutation.mutate({ id });
    }
  };

  const filteredInterventions = interventionsList?.filter((intervention: any) => {
    if (statusFilter !== "all" && intervention.statut !== statusFilter) return false;
    if (!searchQuery) return true;
    return (
      matchSearch(intervention.titre, searchQuery) ||
      matchSearch(intervention.description, searchQuery) ||
      matchSearch(intervention.adresse, searchQuery)
    );
  });

  const activeStatusLabel =
    statusFilter !== "all" ? statusLabels[statusFilter] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Interventions</h1>
          <p className="text-muted-foreground mt-1">
            Planifiez et suivez vos interventions
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle intervention
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle intervention</DialogTitle>
              <DialogDescription>
                Planifiez une nouvelle intervention
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Client *</Label>
                  <Select value={selectedClientId} onValueChange={handleClientChange}>
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
                  <Label htmlFor="titre">Titre *</Label>
                  <Input
                    id="titre"
                    value={formData.titre}
                    onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                    placeholder="Ex: Installation chauffe-eau"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adresse">Adresse</Label>
                  <Input
                    id="adresse"
                    value={formData.adresse}
                    onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                    placeholder="Adresse de l'intervention"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateDebut">Date de début</Label>
                    <Input
                      id="dateDebut"
                      type="datetime-local"
                      value={formData.dateDebut}
                      onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateFin">Date de fin</Label>
                    <Input
                      id="dateFin"
                      type="datetime-local"
                      value={formData.dateFin}
                      onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
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
                  Annuler
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Création..." : "Créer"}
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
            <DialogTitle>Modifier l'intervention</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-titre">Titre *</Label>
                <Input
                  id="edit-titre"
                  value={formData.titre}
                  onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-adresse">Adresse</Label>
                <Input
                  id="edit-adresse"
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-dateDebut">Date de début</Label>
                  <Input
                    id="edit-dateDebut"
                    type="datetime-local"
                    value={formData.dateDebut}
                    onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-dateFin">Date de fin</Label>
                  <Input
                    id="edit-dateFin"
                    type="datetime-local"
                    value={formData.dateFin}
                    onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select value={formData.statut} onValueChange={(v) => setFormData({ ...formData, statut: v as "planifiee" | "en_cours" | "terminee" | "annulee" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planifiee">Planifiée</SelectItem>
                    <SelectItem value="en_cours">En cours</SelectItem>
                    <SelectItem value="terminee">Terminée</SelectItem>
                    <SelectItem value="annulee">Annulée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              {/* OPE-111 — Équipe : intervenants supplémentaires (binôme, aide…) */}
              <div className="space-y-2">
                <Label>Équipe (intervenants supplémentaires)</Label>
                {equipe && equipe.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {equipe.map((m) => (
                      <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
                        {[m.prenom, m.nom].filter(Boolean).join(" ") || `Technicien #${m.technicienId}`}
                        {m.role ? <span className="text-[10px] opacity-70">({m.role})</span> : null}
                        <button
                          type="button"
                          aria-label="Retirer de l'équipe"
                          className="ml-0.5 rounded hover:bg-muted-foreground/20"
                          onClick={() => removeMembreMutation.mutate({ id: m.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun intervenant supplémentaire.</p>
                )}
                <div className="flex gap-2">
                  <Select value={membreToAdd} onValueChange={setMembreToAdd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Ajouter un technicien…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(techniciensList || [])
                        .filter((t: any) => !equipe?.some((m) => m.technicienId === t.id))
                        .map((t: any) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {[t.prenom, t.nom].filter(Boolean).join(" ") || `Technicien #${t.id}`}
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
                      addMembreMutation.mutate({
                        interventionId: selectedIntervention.id,
                        technicienId: parseInt(membreToAdd),
                      })
                    }
                  >
                    Ajouter
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Mise à jour..." : "Mettre à jour"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {activeStatusLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span>
            Filtre actif : <strong>{activeStatusLabel}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-9 px-3 min-h-[36px] text-blue-900 hover:bg-blue-100"
            onClick={() => setLocation("/interventions")}
          >
            Réinitialiser
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher une intervention..."
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
                <th>Titre</th>
                <th className="whitespace-nowrap">Date</th>
                <th className="whitespace-nowrap">Statut</th>
                <th className="whitespace-nowrap">Durée réelle</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredInterventions.map((intervention: any) => (
                <tr key={intervention.id}>
                  <td className="font-medium">
                    {intervention.titre}
                    {/* OPE-111 — équipe (intervenants additionnels) */}
                    {(equipeParIntervention.get(intervention.id)?.length ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {equipeParIntervention.get(intervention.id)!.map((m: any) => (
                          <Badge key={m.technicienId} variant="secondary" className="text-[10px] font-normal gap-1">
                            <Users className="h-2.5 w-2.5" />
                            {[m.prenom, m.nom].filter(Boolean).join(" ") || `Tech #${m.technicienId}`}
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
                  {/* OPE-173 — durée réelle sur site captée par l'app mobile (arrivée→départ) */}
                  <td className="whitespace-nowrap text-muted-foreground">
                    {intervention.dureeReelleMinutes != null
                      ? (intervention.dureeReelleMinutes >= 60
                          ? `${Math.floor(intervention.dureeReelleMinutes / 60)} h ${String(intervention.dureeReelleMinutes % 60).padStart(2, "0")}`
                          : `${intervention.dureeReelleMinutes} min`)
                      : "-"}
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
                          Modifier
                        </DropdownMenuItem>
                        {/* OPE-161 — bon d'intervention signé (disponible dès qu'elle est terminée) */}
                        {intervention.statut === "terminee" && (
                          <DropdownMenuItem asChild>
                            <a
                              href={`/api/interventions/${intervention.id}/bon-pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileDown className="h-4 w-4 mr-2" />
                              Bon d'intervention
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDelete(intervention.id)}
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
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery ? "Aucune intervention trouvée" : "Aucune intervention"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery 
                ? "Essayez avec d'autres termes de recherche"
                : "Commencez par planifier votre première intervention"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Planifier une intervention
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
