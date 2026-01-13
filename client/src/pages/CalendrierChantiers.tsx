import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Users, 
  MapPin, 
  Clock,
  Building2,
  Download,
  Eye,
  Plus
} from "lucide-react";

interface Intervention {
  id: number;
  chantierId: number;
  chantierNom: string;
  technicienId: number | null;
  technicienNom: string | null;
  dateDebut: string;
  dateFin: string | null;
  statut: string;
  description: string | null;
  adresse: string | null;
  couleur?: string;
}

type ViewMode = "month" | "week" | "day";

const COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-red-500",
];

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export default function CalendrierChantiers() {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedChantierId, setSelectedChantierId] = useState<number | null>(null);
  const [selectedTechnicienId, setSelectedTechnicienId] = useState<number | null>(null);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const { data: chantiers } = trpc.chantiers.list.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();
  const { data: interventionsData } = trpc.interventions.list.useQuery();
  const { data: interventionsChantierData } = trpc.chantiers.getAllInterventionsChantier.useQuery();

  // Transformer les interventions avec les informations des chantiers
  const interventions = useMemo(() => {
    if (!interventionsData || !chantiers) return [];
    
    const chantierMap = new Map(chantiers.map(c => [c.id, c]));
    const technicienMap = new Map<number, any>(techniciens?.map((t) => [t.id, t]) || []);
    
    // Créer un map des associations intervention-chantier
    const interventionChantierMap = new Map<number, number>();
    interventionsChantierData?.forEach((ic: any) => {
      interventionChantierMap.set(ic.interventionId, ic.chantierId);
    });
    
    return interventionsData.map((intervention, index) => {
      const chantierId = interventionChantierMap.get(intervention.id) || 0;
      const chantier = chantierMap.get(chantierId);
      const technicien = technicienMap.get(intervention.technicienId || 0);
      return {
        id: intervention.id,
        chantierId: chantierId,
        chantierNom: chantier?.nom || "Sans chantier",
        technicienId: intervention.technicienId,
        technicienNom: technicien ? `${(technicien as any).prenom || ''} ${(technicien as any).nom}`.trim() : null,
        dateDebut: intervention.dateDebut?.toString() || new Date().toISOString(),
        dateFin: intervention.dateFin?.toString() || null,
        statut: intervention.statut || "planifiee",
        description: intervention.description,
        adresse: chantier?.adresse || intervention.adresse,
        couleur: COLORS[index % COLORS.length],
      };
    });
  }, [interventionsData, chantiers, techniciens, interventionsChantierData]);

  // Filtrer les interventions
  const filteredInterventions = useMemo(() => {
    return interventions.filter(i => {
      if (selectedChantierId && i.chantierId !== selectedChantierId) return false;
      if (selectedTechnicienId && i.technicienId !== selectedTechnicienId) return false;
      return true;
    });
  }, [interventions, selectedChantierId, selectedTechnicienId]);

  // Navigation
  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "month") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (viewMode === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "month") {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (viewMode === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Générer les jours du mois
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Ajuster pour commencer le lundi
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    
    // Jours du mois précédent
    for (let i = startOffset - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ date, isCurrentMonth: false });
    }
    
    // Jours du mois courant
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    
    // Jours du mois suivant pour compléter la grille
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    
    return days;
  };

  // Générer les jours de la semaine
  const getDaysInWeek = () => {
    const date = new Date(currentDate);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    }
    return days;
  };

  // Obtenir les interventions pour un jour donné
  const getInterventionsForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return filteredInterventions.filter(i => {
      const startDate = new Date(i.dateDebut).toISOString().split("T")[0];
      const endDate = i.dateFin ? new Date(i.dateFin).toISOString().split("T")[0] : startDate;
      return dateStr >= startDate && dateStr <= endDate;
    });
  };

  // Formater la date
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  // Obtenir le badge de statut
  const getStatutBadge = (statut: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      planifiee: { variant: "secondary", label: "Planifiée" },
      en_cours: { variant: "default", label: "En cours" },
      terminee: { variant: "outline", label: "Terminée" },
      annulee: { variant: "destructive", label: "Annulée" },
    };
    const { variant, label } = config[statut] || config.planifiee;
    return <Badge variant={variant}>{label}</Badge>;
  };

  // Export du calendrier
  const exportCalendar = () => {
    const events = filteredInterventions.map(i => ({
      titre: `${i.chantierNom} - ${i.description || "Intervention"}`,
      debut: i.dateDebut,
      fin: i.dateFin || i.dateDebut,
      technicien: i.technicienNom,
      adresse: i.adresse,
      statut: i.statut,
    }));
    
    const csv = [
      ["Titre", "Date début", "Date fin", "Technicien", "Adresse", "Statut"].join(";"),
      ...events.map(e => [
        e.titre,
        new Date(e.debut).toLocaleDateString("fr-FR"),
        new Date(e.fin).toLocaleDateString("fr-FR"),
        e.technicien || "",
        e.adresse || "",
        e.statut,
      ].join(";"))
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `calendrier-chantiers-${currentDate.toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("Calendrier exporté");
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendrier des Chantiers</h1>
          <p className="text-muted-foreground">
            Visualisez toutes les interventions planifiées
          </p>
        </div>
        <Button variant="outline" onClick={exportCalendar}>
          <Download className="h-4 w-4 mr-2" />
          Exporter
        </Button>
      </div>

      {/* Filtres et navigation */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Filtres */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedChantierId?.toString() || "all"}
                  onValueChange={(v) => setSelectedChantierId(v === "all" ? null : parseInt(v))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Tous les chantiers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les chantiers</SelectItem>
                    {chantiers?.map((chantier) => (
                      <SelectItem key={chantier.id} value={chantier.id.toString()}>
                        {chantier.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select
                value={selectedTechnicienId?.toString() || "all"}
                onValueChange={(v) => setSelectedTechnicienId(v === "all" ? null : parseInt(v))}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tous les techniciens" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les techniciens</SelectItem>
                  {techniciens?.map((tech: any) => (
                    <SelectItem key={tech.id} value={tech.id.toString()}>
                      {tech.prenom} {tech.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Aujourd'hui
              </Button>
              <Button variant="ghost" size="icon" onClick={navigatePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold min-w-[200px] text-center">
                {viewMode === "month" && `${MOIS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
                {viewMode === "week" && `Semaine du ${getDaysInWeek()[0].toLocaleDateString("fr-FR")}`}
                {viewMode === "day" && formatDate(currentDate)}
              </span>
              <Button variant="ghost" size="icon" onClick={navigateNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Mode de vue */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === "month" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("month")}
              >
                Mois
              </Button>
              <Button
                variant={viewMode === "week" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("week")}
              >
                Semaine
              </Button>
              <Button
                variant={viewMode === "day" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("day")}
              >
                Jour
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendrier */}
      <Card>
        <CardContent className="pt-4">
          {viewMode === "month" && (
            <div>
              {/* En-têtes des jours */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {JOURS.map((jour) => (
                  <div key={jour} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {jour}
                  </div>
                ))}
              </div>
              {/* Grille des jours */}
              <div className="grid grid-cols-7 gap-1">
                {getDaysInMonth().map(({ date, isCurrentMonth }, index) => {
                  const dayInterventions = getInterventionsForDay(date);
                  return (
                    <div
                      key={index}
                      className={`min-h-[100px] border rounded-lg p-1 ${
                        isCurrentMonth ? "bg-background" : "bg-muted/30"
                      } ${isToday(date) ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className={`text-sm font-medium mb-1 ${
                        isCurrentMonth ? "" : "text-muted-foreground"
                      } ${isToday(date) ? "text-primary" : ""}`}>
                        {date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayInterventions.slice(0, 3).map((intervention) => (
                          <div
                            key={intervention.id}
                            className={`text-xs p-1 rounded cursor-pointer text-white truncate ${intervention.couleur}`}
                            onClick={() => {
                              setSelectedIntervention(intervention);
                              setIsDetailDialogOpen(true);
                            }}
                            title={`${intervention.chantierNom} - ${intervention.description || "Intervention"}`}
                          >
                            {intervention.chantierNom}
                          </div>
                        ))}
                        {dayInterventions.length > 3 && (
                          <div className="text-xs text-muted-foreground text-center">
                            +{dayInterventions.length - 3} autres
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "week" && (
            <div>
              {/* En-têtes des jours */}
              <div className="grid grid-cols-7 gap-2 mb-4">
                {getDaysInWeek().map((date, index) => (
                  <div
                    key={index}
                    className={`text-center p-2 rounded-lg ${
                      isToday(date) ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <div className="text-sm font-medium">{JOURS[index]}</div>
                    <div className="text-lg font-bold">{date.getDate()}</div>
                  </div>
                ))}
              </div>
              {/* Interventions par jour */}
              <div className="grid grid-cols-7 gap-2">
                {getDaysInWeek().map((date, index) => {
                  const dayInterventions = getInterventionsForDay(date);
                  return (
                    <div key={index} className="min-h-[300px] border rounded-lg p-2 space-y-2">
                      {dayInterventions.map((intervention) => (
                        <Card
                          key={intervention.id}
                          className={`cursor-pointer hover:shadow-md transition-shadow`}
                          onClick={() => {
                            setSelectedIntervention(intervention);
                            setIsDetailDialogOpen(true);
                          }}
                        >
                          <CardContent className="p-2">
                            <div className={`w-full h-1 rounded mb-2 ${intervention.couleur}`} />
                            <p className="font-medium text-sm truncate">{intervention.chantierNom}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {intervention.description || "Intervention"}
                            </p>
                            {intervention.technicienNom && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <Users className="h-3 w-3" />
                                {intervention.technicienNom}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                      {dayInterventions.length === 0 && (
                        <div className="text-xs text-muted-foreground text-center py-4">
                          Aucune intervention
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "day" && (
            <div>
              <div className="text-center mb-4">
                <h2 className="text-xl font-semibold">{formatDate(currentDate)}</h2>
              </div>
              <div className="space-y-4">
                {getInterventionsForDay(currentDate).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucune intervention planifiée pour cette journée</p>
                  </div>
                ) : (
                  getInterventionsForDay(currentDate).map((intervention) => (
                    <Card
                      key={intervention.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        setSelectedIntervention(intervention);
                        setIsDetailDialogOpen(true);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className={`w-2 h-full min-h-[80px] rounded ${intervention.couleur}`} />
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-lg">{intervention.chantierNom}</h3>
                                <p className="text-muted-foreground">{intervention.description || "Intervention"}</p>
                              </div>
                              {getStatutBadge(intervention.statut)}
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              {intervention.technicienNom && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span>{intervention.technicienNom}</span>
                                </div>
                              )}
                              {intervention.adresse && (
                                <div className="flex items-center gap-2 text-sm">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span className="truncate">{intervention.adresse}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span>
                                  {new Date(intervention.dateDebut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                  {intervention.dateFin && ` - ${new Date(intervention.dateFin).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Légende des chantiers */}
      {chantiers && chantiers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Légende des chantiers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {chantiers.slice(0, 8).map((chantier, index) => (
                <div key={chantier.id} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${COLORS[index % COLORS.length]}`} />
                  <span className="text-sm">{chantier.nom}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de détail */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Détails de l'intervention</DialogTitle>
          </DialogHeader>
          {selectedIntervention && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{selectedIntervention.chantierNom}</p>
                  <p className="text-sm text-muted-foreground">Chantier</p>
                </div>
              </div>
              
              {selectedIntervention.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p>{selectedIntervention.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Date de début</Label>
                  <p>{new Date(selectedIntervention.dateDebut).toLocaleDateString("fr-FR")}</p>
                </div>
                {selectedIntervention.dateFin && (
                  <div>
                    <Label className="text-muted-foreground">Date de fin</Label>
                    <p>{new Date(selectedIntervention.dateFin).toLocaleDateString("fr-FR")}</p>
                  </div>
                )}
              </div>
              
              {selectedIntervention.technicienNom && (
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{selectedIntervention.technicienNom}</p>
                    <p className="text-sm text-muted-foreground">Technicien assigné</p>
                  </div>
                </div>
              )}
              
              {selectedIntervention.adresse && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p>{selectedIntervention.adresse}</p>
                    <p className="text-sm text-muted-foreground">Adresse</p>
                  </div>
                </div>
              )}
              
              <div>
                <Label className="text-muted-foreground">Statut</Label>
                <div className="mt-1">{getStatutBadge(selectedIntervention.statut)}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
