import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, FileText, Loader2, Search, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { Switch as SwitchUI } from "@/components/ui/switch";

interface ContratFormData {
  clientId: number;
  titre: string;
  description: string;
  type: "maintenance_preventive" | "entretien" | "depannage" | "contrat_service";
  montantHT: string;
  tauxTVA: string;
  periodicite: "mensuel" | "trimestriel" | "semestriel" | "annuel";
  dateDebut: string;
  dateFin: string;
  reconduction: boolean;
  preavisResiliation: number;
  conditionsParticulieres: string;
  notes: string;
}

const initialFormData: ContratFormData = {
  clientId: 0,
  titre: "",
  description: "",
  type: "entretien",
  montantHT: "",
  tauxTVA: "20.00",
  periodicite: "annuel",
  dateDebut: new Date().toISOString().split("T")[0],
  dateFin: "",
  reconduction: true,
  preavisResiliation: 1,
  conditionsParticulieres: "",
  notes: "",
};

const typeLabels: Record<string, string> = {
  maintenance_preventive: "Maint. Préventive",
  entretien: "Entretien",
  depannage: "Dépannage",
  contrat_service: "Contrat de Service",
};

const periodiciteLabels: Record<string, string> = {
  mensuel: "Mensuel",
  trimestriel: "Trimestriel",
  semestriel: "Semestriel",
  annuel: "Annuel",
};

export default function Contrats() {
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ContratFormData>(initialFormData);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState<string>("tous");

  const { data: contrats, isLoading, refetch } = trpc.contrats.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const createMutation = trpc.contrats.create.useMutation({
    onSuccess: () => {
      toast.success("Contrat créé avec succès");
      setIsDialogOpen(false);
      setFormData(initialFormData);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.contrats.update.useMutation({
    onSuccess: () => {
      toast.success("Contrat mis à jour");
      setIsDialogOpen(false);
      setEditingId(null);
      setFormData(initialFormData);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.contrats.delete.useMutation({
    onSuccess: () => {
      toast.success("Contrat supprimé");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const generateFactureMutation = trpc.contrats.generateFacture.useMutation({
    onSuccess: () => {
      toast.success("Facture générée avec succès");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    if (!formData.clientId || !formData.titre || !formData.montantHT) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        titre: formData.titre,
        description: formData.description || undefined,
        type: formData.type,
        montantHT: formData.montantHT,
        tauxTVA: formData.tauxTVA,
        periodicite: formData.periodicite,
        dateFin: formData.dateFin || undefined,
        reconduction: formData.reconduction,
        preavisResiliation: formData.preavisResiliation,
        conditionsParticulieres: formData.conditionsParticulieres || undefined,
        notes: formData.notes || undefined,
      });
    } else {
      createMutation.mutate({
        clientId: formData.clientId,
        titre: formData.titre,
        description: formData.description || undefined,
        type: formData.type,
        montantHT: formData.montantHT,
        tauxTVA: formData.tauxTVA,
        periodicite: formData.periodicite,
        dateDebut: formData.dateDebut,
        dateFin: formData.dateFin || undefined,
        reconduction: formData.reconduction,
        preavisResiliation: formData.preavisResiliation,
        conditionsParticulieres: formData.conditionsParticulieres || undefined,
        notes: formData.notes || undefined,
      });
    }
  };

  const handleEdit = (contrat: any) => {
    setEditingId(contrat.id);
    setFormData({
      clientId: contrat.clientId,
      titre: contrat.titre,
      description: contrat.description || "",
      type: contrat.type || "entretien",
      montantHT: contrat.montantHT || "",
      tauxTVA: contrat.tauxTVA || "20.00",
      periodicite: contrat.periodicite,
      dateDebut: contrat.dateDebut ? new Date(contrat.dateDebut).toISOString().split("T")[0] : "",
      dateFin: contrat.dateFin ? new Date(contrat.dateFin).toISOString().split("T")[0] : "",
      reconduction: contrat.reconduction ?? true,
      preavisResiliation: contrat.preavisResiliation ?? 1,
      conditionsParticulieres: contrat.conditionsParticulieres || "",
      notes: contrat.notes || "",
    });
    setIsDialogOpen(true);
  };

  const getStatutBadge = (statut: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      actif: { variant: "default", label: "Actif" },
      suspendu: { variant: "secondary", label: "Suspendu" },
      termine: { variant: "outline", label: "Terminé" },
      annule: { variant: "destructive", label: "Annulé" },
    };
    const config = variants[statut] || { variant: "outline" as const, label: statut };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Filter and search
  const filteredContrats = (contrats || []).filter((c) => {
    if (filterStatut !== "tous" && c.statut !== filterStatut) return false;
    if (search) {
      const q = search.toLowerCase();
      const clientName = `${c.client?.prenom || ""} ${c.client?.nom || ""}`.toLowerCase();
      return (
        c.reference.toLowerCase().includes(q) ||
        c.titre.toLowerCase().includes(q) ||
        clientName.includes(q)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: (contrats || []).length,
    actifs: (contrats || []).filter((c) => c.statut === "actif").length,
    caAnnuel: (contrats || [])
      .filter((c) => c.statut === "actif")
      .reduce((sum, c) => {
        const montant = parseFloat(c.montantHT || "0");
        const mult = { mensuel: 12, trimestriel: 4, semestriel: 2, annuel: 1 }[c.periodicite] || 1;
        return sum + montant * mult;
      }, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Contrats de maintenance</h1>
          <p className="text-muted-foreground">Gérez vos contrats de maintenance et la facturation récurrente</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) { setEditingId(null); setFormData(initialFormData); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nouveau contrat</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifier le contrat" : "Nouveau contrat"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Modifiez les informations du contrat" : "Créez un nouveau contrat de maintenance"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client *</Label>
                  <Select
                    value={formData.clientId ? formData.clientId.toString() : ""}
                    onValueChange={(v) => setFormData({ ...formData, clientId: parseInt(v) })}
                    disabled={!!editingId}
                  >
                    <SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                    <SelectContent>
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.nom} {c.prenom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entretien">Entretien</SelectItem>
                      <SelectItem value="maintenance_preventive">Maintenance Préventive</SelectItem>
                      <SelectItem value="depannage">Dépannage</SelectItem>
                      <SelectItem value="contrat_service">Contrat de Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Titre *</Label>
                <Input value={formData.titre} onChange={(e) => setFormData({ ...formData, titre: e.target.value })} placeholder="Ex: Contrat de maintenance annuel chaudière" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Description des prestations incluses" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Montant HT *</Label>
                  <Input type="number" step="0.01" value={formData.montantHT} onChange={(e) => setFormData({ ...formData, montantHT: e.target.value })} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>TVA (%)</Label>
                  <Input type="number" step="0.01" value={formData.tauxTVA} onChange={(e) => setFormData({ ...formData, tauxTVA: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Périodicité *</Label>
                  <Select value={formData.periodicite} onValueChange={(v: any) => setFormData({ ...formData, periodicite: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensuel">Mensuel</SelectItem>
                      <SelectItem value="trimestriel">Trimestriel</SelectItem>
                      <SelectItem value="semestriel">Semestriel</SelectItem>
                      <SelectItem value="annuel">Annuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date de début *</Label>
                  <Input type="date" value={formData.dateDebut} onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })} disabled={!!editingId} />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin (optionnel)</Label>
                  <Input type="date" value={formData.dateFin} onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label>Reconduction tacite</Label>
                  <SwitchUI checked={formData.reconduction} onCheckedChange={(v) => setFormData({ ...formData, reconduction: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Préavis résiliation (mois)</Label>
                  <Input type="number" min="1" value={formData.preavisResiliation} onChange={(e) => setFormData({ ...formData, preavisResiliation: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Conditions particulières</Label>
                <Textarea value={formData.conditionsParticulieres} onChange={(e) => setFormData({ ...formData, conditionsParticulieres: e.target.value })} placeholder="Conditions spécifiques au contrat..." />
              </div>
              <div className="space-y-2">
                <Label>Notes internes</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Notes internes (non visibles par le client)" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Mettre à jour" : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total contrats</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Contrats actifs</p>
            <p className="text-2xl font-bold text-green-600">{stats.actifs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">CA annuel récurrent</p>
            <p className="text-2xl font-bold text-primary">{stats.caAnnuel.toFixed(2)} €</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher par référence, titre ou client..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous</SelectItem>
            <SelectItem value="actif">Actif</SelectItem>
            <SelectItem value="suspendu">Suspendu</SelectItem>
            <SelectItem value="termine">Terminé</SelectItem>
            <SelectItem value="annule">Annulé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : filteredContrats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{search || filterStatut !== "tous" ? "Aucun contrat trouvé" : "Aucun contrat de maintenance"}</p>
            {!search && filterStatut === "tous" && (
              <Button className="mt-4" onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Créer votre premier contrat</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Titre</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Périodicité</TableHead>
                  <TableHead className="text-right">Montant HT</TableHead>
                  <TableHead>Prochaine fact.</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContrats.map((contrat) => (
                  <TableRow key={contrat.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/contrats/${contrat.id}`)}>
                    <TableCell className="font-medium">{contrat.reference}</TableCell>
                    <TableCell>{contrat.client?.nom} {contrat.client?.prenom}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{contrat.titre}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeLabels[contrat.type || "entretien"] || contrat.type}</Badge>
                    </TableCell>
                    <TableCell>{periodiciteLabels[contrat.periodicite]}</TableCell>
                    <TableCell className="text-right">{parseFloat(contrat.montantHT || "0").toFixed(2)} €</TableCell>
                    <TableCell>
                      {contrat.prochainFacturation ? format(new Date(contrat.prochainFacturation), "dd/MM/yyyy") : "-"}
                    </TableCell>
                    <TableCell>{getStatutBadge(contrat.statut || "actif")}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setLocation(`/contrats/${contrat.id}`)} title="Voir détails">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Télécharger PDF">
                          <a href={`/api/contrats/${contrat.id}/pdf`} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => generateFactureMutation.mutate({ contratId: contrat.id })} disabled={generateFactureMutation.isPending || contrat.statut !== "actif"} title="Générer facture">
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(contrat)} title="Modifier">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Supprimer ce contrat ?")) deleteMutation.mutate({ id: contrat.id }); }} title="Supprimer">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
