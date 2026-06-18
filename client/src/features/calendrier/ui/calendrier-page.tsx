import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import Calendar from "./calendar";
import { Button } from "@/shared/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { groupEquipeByIntervention, buildAdresse } from "../../interventions/domain/intervention";
import { useCalendrier } from "../application/use-calendrier";
import { toCalendarItems, defaultHeureFin, heureDeDate, combineDateTime, type CalendarItem } from "../domain/calendrier";

const initialForm = {
  titre: "",
  description: "",
  clientId: "",
  dateDebut: "",
  heureDebut: "09:00",
  dateFin: "",
  heureFin: "10:00",
  adresse: "",
};

export default function CalendrierPage() {
  const { t } = useTranslation("calendrier");
  const { interventions, clients, equipesByArtisan, isLoading, create, update } = useCalendrier();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState(initialForm);

  const resetForm = () => setFormData(initialForm);

  const equipeParIntervention = groupEquipeByIntervention(equipesByArtisan);
  const calendarItems = toCalendarItems(interventions, clients, equipeParIntervention);

  const handleAddClick = (date: Date) => {
    setSelectedDate(date);
    const dateStr = format(date, "yyyy-MM-dd");
    setFormData({
      ...formData,
      dateDebut: dateStr,
      dateFin: dateStr,
      heureDebut: heureDeDate(date) || "09:00",
      heureFin: defaultHeureFin(date),
    });
    setIsAddDialogOpen(true);
  };

  const handleInterventionClick = (intervention: CalendarItem) => {
    window.location.assign(`/interventions?id=${intervention.id}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titre || !formData.dateDebut) {
      toast.error(t("champsObligatoires"));
      return;
    }
    const dateDebut = combineDateTime(formData.dateDebut, formData.heureDebut);
    if (!dateDebut) return;
    const dateFin = combineDateTime(formData.dateFin, formData.heureFin);
    create.mutate(
      {
        titre: formData.titre,
        description: formData.description || undefined,
        clientId: formData.clientId ? parseInt(formData.clientId) : 0,
        dateDebut: dateDebut.toISOString(),
        dateFin: dateFin ? dateFin.toISOString() : undefined,
        adresse: formData.adresse || undefined,
      },
      {
        onSuccess: () => { setIsAddDialogOpen(false); resetForm(); toast.success(t("toastCree")); },
        onError: () => toast.error(t("toastCreeErreur")),
      },
    );
  };

  const handleInterventionDrop = (interventionId: number, newDate: Date) => {
    update.mutate(
      { id: interventionId, dateDebut: newDate.toISOString() },
      { onSuccess: () => toast.success(t("toastDeplacee")), onError: () => toast.error(t("toastDeplaceeErreur")) },
    );
  };

  const handleClientChange = (clientId: string) => {
    const client = clients.find((c) => c.id === parseInt(clientId));
    const adresse = client ? buildAdresse(client) : "";
    setFormData((prev) => ({ ...prev, clientId, adresse: adresse || prev.adresse }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <Calendar
        interventions={calendarItems}
        onAddClick={handleAddClick}
        onInterventionClick={handleInterventionClick}
        onInterventionDrop={handleInterventionDrop}
      />

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>
              {selectedDate && t("dialogDescription", { date: format(selectedDate, "dd/MM/yyyy") })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="titre">{t("titre")}</Label>
                <Input
                  id="titre"
                  value={formData.titre}
                  onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                  placeholder={t("titrePlaceholder")}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientId">{t("client")}</Label>
                <Select value={formData.clientId} onValueChange={handleClientChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("clientPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={String(client.id)}>
                        {client.prenom} {client.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateDebut">{t("dateDebut")}</Label>
                  <Input id="dateDebut" type="date" value={formData.dateDebut} onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="heureDebut">{t("heureDebut")}</Label>
                  <Input id="heureDebut" type="time" value={formData.heureDebut} onChange={(e) => setFormData({ ...formData, heureDebut: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateFin">{t("dateFin")}</Label>
                  <Input id="dateFin" type="date" value={formData.dateFin} onChange={(e) => setFormData({ ...formData, dateFin: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="heureFin">{t("heureFin")}</Label>
                  <Input id="heureFin" type="time" value={formData.heureFin} onChange={(e) => setFormData({ ...formData, heureFin: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adresse">{t("adresse")}</Label>
                <Input id="adresse" value={formData.adresse} onChange={(e) => setFormData({ ...formData, adresse: e.target.value })} placeholder={t("adressePlaceholder")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t("description")}</Label>
                <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t("descriptionPlaceholder")} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t("annuler")}</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? t("creationEnCours") : t("planifier")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
