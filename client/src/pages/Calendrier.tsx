import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import Calendar from "@/components/Calendar";

export default function Calendrier() {
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    titre: "",
    description: "",
    clientId: "",
    dateDebut: "",
    heureDebut: "09:00",
    dateFin: "",
    heureFin: "10:00",
    adresse: "",
  });

  const utils = trpc.useUtils();
  const { data: interventions, isLoading } = trpc.interventions.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();

  const createMutation = trpc.interventions.create.useMutation({
    onSuccess: () => {
      utils.interventions.list.invalidate();
      setIsAddDialogOpen(false);
      resetForm();
      toast.success("Intervention planifiée avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la création de l'intervention");
    },
  });

  const updateMutation = trpc.interventions.update.useMutation({
    onSuccess: () => {
      utils.interventions.list.invalidate();
      toast.success("Intervention déplacée");
    },
    onError: () => {
      toast.error("Erreur lors du déplacement");
    },
  });

  const resetForm = () => {
    setFormData({
      titre: "",
      description: "",
      clientId: "",
      dateDebut: "",
      heureDebut: "09:00",
      dateFin: "",
      heureFin: "10:00",
      adresse: "",
    });
  };

  const handleAddClick = (date: Date) => {
    setSelectedDate(date);
    const dateStr = format(date, "yyyy-MM-dd");
    const heureStr = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    setFormData({
      ...formData,
      dateDebut: dateStr,
      dateFin: dateStr,
      heureDebut: heureStr || "09:00",
      heureFin: `${String(Math.min(date.getHours() + 1, 20)).padStart(2, "0")}:00`,
    });
    setIsAddDialogOpen(true);
  };

  const handleInterventionClick = (intervention: any) => {
    setLocation(`/interventions?id=${intervention.id}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titre || !formData.dateDebut) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }

    const dateDebut = new Date(`${formData.dateDebut}T${formData.heureDebut}`);
    const dateFin = formData.dateFin
      ? new Date(`${formData.dateFin}T${formData.heureFin}`)
      : undefined;

    createMutation.mutate({
      titre: formData.titre,
      description: formData.description || undefined,
      clientId: formData.clientId ? parseInt(formData.clientId) : 0,
      dateDebut: dateDebut.toISOString(),
      dateFin: dateFin?.toISOString(),
      adresse: formData.adresse || undefined,
      
    });
  };

  const handleInterventionDrop = (interventionId: number, newDate: Date) => {
    updateMutation.mutate({
      id: interventionId,
      dateDebut: newDate.toISOString(),
    });
  };

  const handleClientChange = (clientId: string) => {
    setFormData({ ...formData, clientId });
    const client = clients?.find((c: any) => c.id === parseInt(clientId));
    if (client?.adresse) {
      setFormData((prev) => ({
        ...prev,
        clientId,
        adresse: `${client.adresse}, ${client.codePostal || ""} ${client.ville || ""}`.trim(),
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const formattedInterventions = (interventions || []).map((i: any) => ({
    id: i.id,
    titre: i.titre,
    dateDebut: i.dateDebut,
    dateFin: i.dateFin,
    statut: i.statut,
    adresse: i.adresse,
    client: i.client,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Calendrier</h1>
          <p className="text-muted-foreground">
            Visualisez et planifiez vos interventions — glissez-déposez pour replanifier
          </p>
        </div>
      </div>

      <Calendar
        interventions={formattedInterventions}
        onAddClick={handleAddClick}
        onInterventionClick={handleInterventionClick}
        onInterventionDrop={handleInterventionDrop}
      />

        {/* Dialog pour ajouter une intervention */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Planifier une intervention</DialogTitle>
              <DialogDescription>
                {selectedDate && (
                  <>Créer une intervention pour le {format(selectedDate, "dd/MM/yyyy")}</>
                )}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
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
                  <Label htmlFor="clientId">Client</Label>
                  <Select value={formData.clientId} onValueChange={handleClientChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((client: any) => (
                        <SelectItem key={client.id} value={String(client.id)}>
                          {client.prenom} {client.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateDebut">Date début *</Label>
                    <Input
                      id="dateDebut"
                      type="date"
                      value={formData.dateDebut}
                      onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="heureDebut">Heure début</Label>
                    <Input
                      id="heureDebut"
                      type="time"
                      value={formData.heureDebut}
                      onChange={(e) => setFormData({ ...formData, heureDebut: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateFin">Date fin</Label>
                    <Input
                      id="dateFin"
                      type="date"
                      value={formData.dateFin}
                      onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="heureFin">Heure fin</Label>
                    <Input
                      id="heureFin"
                      type="time"
                      value={formData.heureFin}
                      onChange={(e) => setFormData({ ...formData, heureFin: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adresse">Adresse d'intervention</Label>
                  <Input
                    id="adresse"
                    value={formData.adresse}
                    onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                    placeholder="Adresse du chantier"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Détails de l'intervention..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Création..." : "Planifier"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
    </div>
  );
}
