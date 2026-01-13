import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Plus,
  Palette,
  GripVertical,
  Move,
  Printer
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
  { name: "Bleu", class: "bg-blue-500", hex: "#3b82f6" },
  { name: "Vert", class: "bg-green-500", hex: "#22c55e" },
  { name: "Violet", class: "bg-purple-500", hex: "#a855f7" },
  { name: "Orange", class: "bg-orange-500", hex: "#f97316" },
  { name: "Rose", class: "bg-pink-500", hex: "#ec4899" },
  { name: "Cyan", class: "bg-teal-500", hex: "#14b8a6" },
  { name: "Indigo", class: "bg-indigo-500", hex: "#6366f1" },
  { name: "Rouge", class: "bg-red-500", hex: "#ef4444" },
  { name: "Jaune", class: "bg-yellow-500", hex: "#eab308" },
  { name: "Gris", class: "bg-gray-500", hex: "#6b7280" },
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
  const [draggedIntervention, setDraggedIntervention] = useState<Intervention | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [customColors, setCustomColors] = useState<Record<number, string>>({});
  const [colorMode, setColorMode] = useState<"chantier" | "technicien" | "statut">("chantier");

  const utils = trpc.useUtils();
  const { data: chantiers } = trpc.chantiers.list.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();
  const { data: interventionsData } = trpc.interventions.list.useQuery();
  const { data: interventionsChantierData } = trpc.chantiers.getAllInterventionsChantier.useQuery();
  const { data: savedColors } = trpc.interventions.getCouleursCalendrier.useQuery();

  const setCouleurMutation = trpc.interventions.setCouleurIntervention.useMutation({
    onSuccess: () => {
      utils.interventions.getCouleursCalendrier.invalidate();
    },
  });

  const updateInterventionMutation = trpc.interventions.update.useMutation({
    onSuccess: () => {
      toast.success("Intervention déplacée avec succès");
      utils.interventions.list.invalidate();
    },
    onError: (error) => {
      toast.error("Erreur lors du déplacement: " + error.message);
    },
  });

  // Fonction pour obtenir la couleur d'une intervention
  const getInterventionColor = useCallback((intervention: Intervention, index: number) => {
    // Vérifier si une couleur personnalisée existe
    if (customColors[intervention.id]) {
      return customColors[intervention.id];
    }
    
    // Couleur basée sur le mode sélectionné
    switch (colorMode) {
      case "technicien":
        if (intervention.technicienId) {
          return COLORS[intervention.technicienId % COLORS.length].class;
        }
        return COLORS[0].class;
      case "statut":
        const statutColors: Record<string, string> = {
          planifiee: "bg-blue-500",
          en_cours: "bg-yellow-500",
          terminee: "bg-green-500",
          annulee: "bg-red-500",
        };
        return statutColors[intervention.statut] || COLORS[0].class;
      case "chantier":
      default:
        return COLORS[intervention.chantierId % COLORS.length].class;
    }
  }, [customColors, colorMode]);

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
      const interventionObj: Intervention = {
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
      };
      return interventionObj;
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

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, intervention: Intervention) => {
    setDraggedIntervention(intervention);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", intervention.id.toString());
  };

  const handleDragOver = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(date);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    setDragOverDate(null);
    
    if (!draggedIntervention) return;
    
    const originalDate = new Date(draggedIntervention.dateDebut);
    const diffDays = Math.floor((targetDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      setDraggedIntervention(null);
      return;
    }
    
    // Calculer les nouvelles dates
    const newDateDebut = new Date(originalDate);
    newDateDebut.setDate(newDateDebut.getDate() + diffDays);
    
    let newDateFin = null;
    if (draggedIntervention.dateFin) {
      const originalDateFin = new Date(draggedIntervention.dateFin);
      newDateFin = new Date(originalDateFin);
      newDateFin.setDate(newDateFin.getDate() + diffDays);
    }
    
    // Mettre à jour l'intervention
    updateInterventionMutation.mutate({
      id: draggedIntervention.id,
      dateDebut: newDateDebut.toISOString(),
      dateFin: newDateFin?.toISOString() || undefined,
    });
    
    setDraggedIntervention(null);
  };

  const handleDragEnd = () => {
    setDraggedIntervention(null);
    setDragOverDate(null);
  };

  // Charger les couleurs sauvegardées au démarrage
  useEffect(() => {
    if (savedColors) {
      setCustomColors(savedColors as Record<number, string>);
    }
  }, [savedColors]);

  // Changer la couleur d'une intervention et sauvegarder en BDD
  const setInterventionColor = (interventionId: number, colorClass: string) => {
    setCustomColors(prev => ({
      ...prev,
      [interventionId]: colorClass,
    }));
    setCouleurMutation.mutate({ interventionId, couleur: colorClass });
    toast.success("Couleur sauvegardée");
  };

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
    
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    
    for (let i = startOffset - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ date, isCurrentMonth: false });
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    
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

  // Impression du calendrier
  const handlePrint = () => {
    const printContent = document.getElementById('calendar-print-area');
    if (!printContent) {
      toast.error("Impossible d'imprimer le calendrier");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Veuillez autoriser les pop-ups pour imprimer");
      return;
    }

    const title = viewMode === 'month' 
      ? `${MOIS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
      : viewMode === 'week'
      ? `Semaine du ${getDaysInWeek()[0].toLocaleDateString("fr-FR")}`
      : formatDate(currentDate);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Calendrier des Chantiers - ${title}</title>
        <style>
          @page {
            size: landscape;
            margin: 1cm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
          }
          .print-header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
          }
          .print-header h1 {
            margin: 0 0 5px 0;
            font-size: 24px;
          }
          .print-header p {
            margin: 0;
            color: #666;
            font-size: 14px;
          }
          .calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 1px;
            background: #ddd;
            border: 1px solid #ddd;
          }
          .day-header {
            background: #f5f5f5;
            padding: 8px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
          }
          .day-cell {
            background: white;
            min-height: 80px;
            padding: 4px;
            vertical-align: top;
          }
          .day-number {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 4px;
          }
          .day-cell.other-month {
            background: #fafafa;
            color: #999;
          }
          .day-cell.today {
            background: #e3f2fd;
          }
          .event {
            font-size: 10px;
            padding: 2px 4px;
            margin-bottom: 2px;
            border-radius: 2px;
            color: white;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .event.blue { background: #3b82f6; }
          .event.green { background: #22c55e; }
          .event.purple { background: #a855f7; }
          .event.orange { background: #f97316; }
          .event.pink { background: #ec4899; }
          .event.teal { background: #14b8a6; }
          .event.indigo { background: #6366f1; }
          .event.red { background: #ef4444; }
          .event.yellow { background: #eab308; color: #333; }
          .event.gray { background: #6b7280; }
          .legend {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #ddd;
          }
          .legend h3 {
            font-size: 14px;
            margin: 0 0 10px 0;
          }
          .legend-items {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }
          .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
          }
          .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
          }
          .filters-info {
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>Calendrier des Chantiers</h1>
          <p>${title}</p>
        </div>
        ${selectedChantierId || selectedTechnicienId ? `
          <div class="filters-info">
            Filtres actifs: 
            ${selectedChantierId ? `Chantier: ${chantiers?.find(c => c.id === selectedChantierId)?.nom || ''}` : ''}
            ${selectedTechnicienId ? `Technicien: ${(techniciens as any[])?.find((t: any) => t.id === selectedTechnicienId)?.nom || ''}` : ''}
          </div>
        ` : ''}
        <div class="calendar-grid">
          ${JOURS.map(j => `<div class="day-header">${j}</div>`).join('')}
          ${getDaysInMonth().map(({ date, isCurrentMonth }) => {
            const dayInterventions = getInterventionsForDay(date);
            const colorClassToName = (cls: string) => {
              if (cls.includes('blue')) return 'blue';
              if (cls.includes('green')) return 'green';
              if (cls.includes('purple')) return 'purple';
              if (cls.includes('orange')) return 'orange';
              if (cls.includes('pink')) return 'pink';
              if (cls.includes('teal')) return 'teal';
              if (cls.includes('indigo')) return 'indigo';
              if (cls.includes('red')) return 'red';
              if (cls.includes('yellow')) return 'yellow';
              return 'gray';
            };
            return `
              <div class="day-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday(date) ? 'today' : ''}">
                <div class="day-number">${date.getDate()}</div>
                ${dayInterventions.slice(0, 3).map((i: Intervention, idx: number) => `
                  <div class="event ${colorClassToName(getInterventionColor(i, idx))}">
                    ${i.chantierNom}
                  </div>
                `).join('')}
                ${dayInterventions.length > 3 ? `<div style="font-size: 10px; color: #666;">+${dayInterventions.length - 3} autres</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div class="legend">
          <h3>Légende (${colorMode === 'chantier' ? 'Par chantier' : colorMode === 'technicien' ? 'Par technicien' : 'Par statut'})</h3>
          <div class="legend-items">
            ${colorMode === 'statut' ? `
              <div class="legend-item"><div class="legend-color" style="background: #3b82f6;"></div>Planifiée</div>
              <div class="legend-item"><div class="legend-color" style="background: #eab308;"></div>En cours</div>
              <div class="legend-item"><div class="legend-color" style="background: #22c55e;"></div>Terminée</div>
              <div class="legend-item"><div class="legend-color" style="background: #ef4444;"></div>Annulée</div>
            ` : colorMode === 'technicien' ? 
              (techniciens as any[] || []).slice(0, 5).map((t: any, i: number) => `
                <div class="legend-item">
                  <div class="legend-color" style="background: ${COLORS[i % COLORS.length].hex};"></div>
                  ${t.prenom || ''} ${t.nom}
                </div>
              `).join('')
            : 
              (chantiers || []).slice(0, 5).map((c, i) => `
                <div class="legend-item">
                  <div class="legend-color" style="background: ${COLORS[c.id % COLORS.length].hex};"></div>
                  ${c.nom}
                </div>
              `).join('')
            }
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isDragOver = (date: Date) => {
    return dragOverDate && date.toDateString() === dragOverDate.toDateString();
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendrier des Chantiers</h1>
          <p className="text-muted-foreground">
            Glissez-déposez les interventions pour les réorganiser
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Palette className="h-4 w-4 mr-2" />
                Couleurs
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-4">
                <div>
                  <Label>Mode de coloration</Label>
                  <Select value={colorMode} onValueChange={(v: "chantier" | "technicien" | "statut") => setColorMode(v)}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chantier">Par chantier</SelectItem>
                      <SelectItem value="technicien">Par technicien</SelectItem>
                      <SelectItem value="statut">Par statut</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">
                    Cliquez sur une intervention pour personnaliser sa couleur
                  </Label>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={exportCalendar}>
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimer
          </Button>
        </div>
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

      {/* Indicateur drag-and-drop */}
      {draggedIntervention && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
          <Move className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-700">
            Déplacez "{draggedIntervention.chantierNom}" vers une nouvelle date
          </span>
        </div>
      )}

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
                      className={`min-h-[100px] border rounded-lg p-1 transition-colors ${
                        isCurrentMonth ? "bg-background" : "bg-muted/30"
                      } ${isToday(date) ? "ring-2 ring-primary" : ""} ${
                        isDragOver(date) ? "bg-blue-100 border-blue-400" : ""
                      }`}
                      onDragOver={(e) => handleDragOver(e, date)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, date)}
                    >
                      <div className={`text-sm font-medium mb-1 ${
                        isCurrentMonth ? "" : "text-muted-foreground"
                      } ${isToday(date) ? "text-primary" : ""}`}>
                        {date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayInterventions.slice(0, 3).map((intervention, idx) => (
                          <Popover key={intervention.id}>
                            <PopoverTrigger asChild>
                              <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, intervention)}
                                onDragEnd={handleDragEnd}
                                className={`text-xs p-1 rounded cursor-grab active:cursor-grabbing text-white truncate flex items-center gap-1 ${getInterventionColor(intervention, idx)} ${
                                  draggedIntervention?.id === intervention.id ? "opacity-50" : ""
                                }`}
                                title={`${intervention.chantierNom} - ${intervention.description || "Intervention"}`}
                              >
                                <GripVertical className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{intervention.chantierNom}</span>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-64">
                              <div className="space-y-3">
                                <div>
                                  <h4 className="font-semibold">{intervention.chantierNom}</h4>
                                  <p className="text-sm text-muted-foreground">{intervention.description || "Intervention"}</p>
                                </div>
                                <div>
                                  <Label className="text-sm">Changer la couleur</Label>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {COLORS.map((color) => (
                                      <button
                                        key={color.class}
                                        className={`w-6 h-6 rounded-full ${color.class} hover:ring-2 ring-offset-2 transition-all ${
                                          (customColors[intervention.id] || getInterventionColor(intervention, idx)) === color.class ? "ring-2" : ""
                                        }`}
                                        onClick={() => setInterventionColor(intervention.id, color.class)}
                                        title={color.name}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full"
                                  onClick={() => {
                                    setSelectedIntervention(intervention);
                                    setIsDetailDialogOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Voir les détails
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
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
                    <div
                      key={index}
                      className={`min-h-[300px] border rounded-lg p-2 space-y-2 transition-colors ${
                        isDragOver(date) ? "bg-blue-100 border-blue-400" : ""
                      }`}
                      onDragOver={(e) => handleDragOver(e, date)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, date)}
                    >
                      {dayInterventions.map((intervention, idx) => (
                        <Card
                          key={intervention.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, intervention)}
                          onDragEnd={handleDragEnd}
                          className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                            draggedIntervention?.id === intervention.id ? "opacity-50" : ""
                          }`}
                          onClick={() => {
                            setSelectedIntervention(intervention);
                            setIsDetailDialogOpen(true);
                          }}
                        >
                          <CardContent className="p-2">
                            <div className={`w-full h-1 rounded mb-2 ${getInterventionColor(intervention, idx)}`} />
                            <div className="flex items-start gap-1">
                              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
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
                              </div>
                            </div>
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
              <div
                className={`space-y-4 min-h-[200px] p-4 rounded-lg transition-colors ${
                  isDragOver(currentDate) ? "bg-blue-100 border-2 border-blue-400 border-dashed" : ""
                }`}
                onDragOver={(e) => handleDragOver(e, currentDate)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, currentDate)}
              >
                {getInterventionsForDay(currentDate).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucune intervention planifiée pour cette journée</p>
                    <p className="text-sm mt-2">Glissez une intervention ici pour la déplacer</p>
                  </div>
                ) : (
                  getInterventionsForDay(currentDate).map((intervention, idx) => (
                    <Card
                      key={intervention.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, intervention)}
                      onDragEnd={handleDragEnd}
                      className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                        draggedIntervention?.id === intervention.id ? "opacity-50" : ""
                      }`}
                      onClick={() => {
                        setSelectedIntervention(intervention);
                        setIsDetailDialogOpen(true);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-5 w-5 text-muted-foreground" />
                            <div className={`w-2 h-full min-h-[80px] rounded ${getInterventionColor(intervention, idx)}`} />
                          </div>
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

      {/* Légende des couleurs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Légende ({colorMode === "chantier" ? "Par chantier" : colorMode === "technicien" ? "Par technicien" : "Par statut"})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {colorMode === "chantier" && chantiers?.slice(0, 10).map((chantier, index) => (
              <div key={chantier.id} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded ${COLORS[chantier.id % COLORS.length].class}`} />
                <span className="text-sm">{chantier.nom}</span>
              </div>
            ))}
            {colorMode === "technicien" && techniciens?.slice(0, 10).map((tech: any, index) => (
              <div key={tech.id} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded ${COLORS[tech.id % COLORS.length].class}`} />
                <span className="text-sm">{tech.prenom} {tech.nom}</span>
              </div>
            ))}
            {colorMode === "statut" && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-500" />
                  <span className="text-sm">Planifiée</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-500" />
                  <span className="text-sm">En cours</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500" />
                  <span className="text-sm">Terminée</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-500" />
                  <span className="text-sm">Annulée</span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

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

              <div>
                <Label className="text-muted-foreground">Couleur personnalisée</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {COLORS.map((color) => (
                    <button
                      key={color.class}
                      className={`w-6 h-6 rounded-full ${color.class} hover:ring-2 ring-offset-2 transition-all ${
                        customColors[selectedIntervention.id] === color.class ? "ring-2" : ""
                      }`}
                      onClick={() => setInterventionColor(selectedIntervention.id, color.class)}
                      title={color.name}
                    />
                  ))}
                </div>
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
