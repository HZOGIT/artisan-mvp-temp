import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ContratFormData {
  clientId: number;
  titre: string;
  description: string;
  montantHT: string;
  tauxTVA: string;
  periodicite: "mensuel" | "trimestriel" | "semestriel" | "annuel";
  dateDebut: string;
  dateFin: string;
  notes: string;
}

const initialFormData: ContratFormData = {
  clientId: 0,
  titre: "",
  description: "",
  montantHT: "",
  tauxTVA: "20.00",
  periodicite: "mensuel",
  dateDebut: new Date().toISOString().split("T")[0],
  dateFin: "",
  notes: "",
};

export default function Contrats() {
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ContratFormData>(initialFormData);

  const { data: contrats, isLoading, refetch } = trpc.contrats.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const createMutation = trpc.contrats.create.useMutation({
    onSuccess: () => {
      toast.success("Contrat créé avec succès");
      setIsDialogOpen(false);
      setFormData(initialFormData);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.contrats.update.useMutation({
    onSuccess: () => {
      toast.success("Contrat mis à jour avec succès");
      setIsDialogOpen(false);
      setEditingId(null);
      setFormData(initialFormData);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.contrats.delete.useMutation({
    onSuccess: () => {
      toast.success("Contrat supprimé avec succès");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const generateFactureMutation = trpc.contrats.generateFacture.useMutation({
    onSuccess: () => {
      toast.success("Facture générée avec succès");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
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
        montantHT: formData.montantHT,
        tauxTVA: formData.tauxTVA,
        periodicite: formData.periodicite,
        dateFin: formData.dateFin || undefined,
        notes: formData.notes || undefined,
      });
    } else {
      createMutation.mutate({
        clientId: formData.clientId,
        titre: formData.titre,
        description: formData.description || undefined,
        montantHT: formData.montantHT,
        tauxTVA: formData.tauxTVA,
        periodicite: formData.periodicite,
        dateDebut: formData.dateDebut,
        dateFin: formData.dateFin || undefined,
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
      montantHT: contrat.montantHT || "",
      tauxTVA: contrat.tauxTVA || "20.00",
      periodicite: contrat.periodicite,
      dateDebut: contrat.dateDebut ? new Date(contrat.dateDebut).toISOString().split("T")[0] : "",
      dateFin: contrat.dateFin ? new Date(contrat.dateFin).toISOString().split("T")[0] : "",
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

  const getPeriodiciteLabel = (periodicite: string) => {
    const labels: Record<string, string> = {
      mensuel: "Mensuel",
      trimestriel: "Trimestriel",
      semestriel: "Semestriel",
      annuel: "Annuel",
    };
    return labels[periodicite] || periodicite;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Contrats de maintenance</h1>
            <p className="text-muted-foreground">Gérez vos contrats de maintenance et la facturation récurrente</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingId(null);
              setFormData(initialFormData);
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau contrat
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId ? "Modifier le contrat" : "Nouveau contrat"}</DialogTitle>
                <DialogDescription>
                  {editingId ? "Modifiez les informations du contrat" : "Créez un nouveau contrat de maintenance"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="client">Client *</Label>
                    <Select
                      value={formData.clientId ? formData.clientId.toString() : ""}
                      onValueChange={(value) => setFormData({ ...formData, clientId: parseInt(value) })}
                      disabled={!!editingId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id.toString()}>
                            {client.nom} {client.prenom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="periodicite">Périodicité *</Label>
                    <Select
                      value={formData.periodicite}
                      onValueChange={(value: any) => setFormData({ ...formData, periodicite: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensuel">Mensuel</SelectItem>
                        <SelectItem value="trimestriel">Trimestriel</SelectItem>
                        <SelectItem value="semestriel">Semestriel</SelectItem>
                        <SelectItem value="annuel">Annuel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="titre">Titre *</Label>
                  <Input
                    id="titre"
                    value={formData.titre}
                    onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                    placeholder="Ex: Contrat de maintenance annuel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Description des prestations incluses"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="montantHT">Montant HT *</Label>
                    <Input
                      id="montantHT"
                      type="number"
                      step="0.01"
                      value={formData.montantHT}
                      onChange={(e) => setFormData({ ...formData, montantHT: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tauxTVA">Taux TVA (%)</Label>
                    <Input
                      id="tauxTVA"
                      type="number"
                      step="0.01"
                      value={formData.tauxTVA}
                      onChange={(e) => setFormData({ ...formData, tauxTVA: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateDebut">Date de début *</Label>
                    <Input
                      id="dateDebut"
                      type="date"
                      value={formData.dateDebut}
                      onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                      disabled={!!editingId}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateFin">Date de fin (optionnel)</Label>
                    <Input
                      id="dateFin"
                      type="date"
                      value={formData.dateFin}
                      onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notes internes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingId ? "Mettre à jour" : "Créer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : contrats?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Aucun contrat de maintenance</p>
              <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Créer votre premier contrat
              </Button>
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
                    <TableHead>Périodicité</TableHead>
                    <TableHead className="text-right">Montant HT</TableHead>
                    <TableHead>Prochaine facturation</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contrats?.map((contrat) => (
                    <TableRow key={contrat.id}>
                      <TableCell className="font-medium">{contrat.reference}</TableCell>
                      <TableCell>
                        {contrat.client?.nom} {contrat.client?.prenom}
                      </TableCell>
                      <TableCell>{contrat.titre}</TableCell>
                      <TableCell>{getPeriodiciteLabel(contrat.periodicite)}</TableCell>
                      <TableCell className="text-right">
                        {parseFloat(contrat.montantHT || "0").toFixed(2)} €
                      </TableCell>
                      <TableCell>
                        {contrat.prochainFacturation
                          ? format(new Date(contrat.prochainFacturation), "dd/MM/yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>{getStatutBadge(contrat.statut || "actif")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => generateFactureMutation.mutate({ contratId: contrat.id })}
                            disabled={generateFactureMutation.isPending || contrat.statut !== "actif"}
                            title="Générer une facture"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEdit(contrat)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              if (confirm("Êtes-vous sûr de vouloir supprimer ce contrat ?")) {
                                deleteMutation.mutate({ id: contrat.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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
    </DashboardLayout>
  );
}
