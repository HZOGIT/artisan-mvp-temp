import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

interface Intervention {
  id: number;
  titre: string;
  dateDebut: Date | string;
  dateFin?: Date | string | null;
  statut: string;
  client?: {
    nom: string;
    prenom?: string | null;
  } | null;
}

interface CalendarProps {
  interventions: Intervention[];
  onDateClick?: (date: Date) => void;
  onInterventionClick?: (intervention: Intervention) => void;
  onAddClick?: (date: Date) => void;
  onInterventionDrop?: (interventionId: number, newDate: Date) => void;
}

const statusColors: Record<string, string> = {
  planifiee: "bg-blue-500",
  en_cours: "bg-yellow-500",
  terminee: "bg-green-500",
  annulee: "bg-red-500",
};

const statusLabels: Record<string, string> = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

export default function Calendar({ interventions, onDateClick, onInterventionClick, onAddClick, onInterventionDrop }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const interventionsByDate = useMemo(() => {
    const map = new Map<string, Intervention[]>();
    interventions.forEach((intervention) => {
      const date = new Date(intervention.dateDebut);
      const key = format(date, "yyyy-MM-dd");
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(intervention);
    });
    return map;
  }, [interventions]);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateClick?.(date);
  };

  const selectedDateInterventions = selectedDate
    ? interventionsByDate.get(format(selectedDate, "yyyy-MM-dd")) || []
    : [];

  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Calendrier */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">
              {format(currentDate, "MMMM yyyy", { locale: fr })}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleToday}>
                Aujourd'hui
              </Button>
              <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* En-têtes des jours */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grille des jours */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayInterventions = interventionsByDate.get(dateKey) || [];
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <div
                  key={dateKey}
                  onClick={() => handleDateClick(day)}
                  onDragOver={(e) => {
                    if (!onInterventionDrop) return;
                    e.preventDefault();
                    setDragOverDate(dateKey);
                  }}
                  onDragLeave={() => setDragOverDate(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverDate(null);
                    const interventionId = e.dataTransfer.getData("interventionId");
                    if (interventionId && onInterventionDrop) {
                      onInterventionDrop(parseInt(interventionId), day);
                    }
                  }}
                  className={`
                    relative min-h-[80px] p-1 text-left border rounded-lg transition-colors cursor-pointer
                    ${isCurrentMonth ? "bg-background" : "bg-muted/30"}
                    ${isToday ? "border-primary" : "border-border"}
                    ${isSelected ? "ring-2 ring-primary" : ""}
                    ${dragOverDate === dateKey ? "ring-2 ring-primary/50 bg-primary/5" : ""}
                    hover:bg-accent
                  `}
                >
                  <span
                    className={`
                      text-sm font-medium
                      ${!isCurrentMonth ? "text-muted-foreground" : ""}
                      ${isToday ? "text-primary font-bold" : ""}
                    `}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayInterventions.slice(0, 2).map((intervention) => (
                      <div
                        key={intervention.id}
                        draggable={!!onInterventionDrop}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("interventionId", String(intervention.id));
                          e.stopPropagation();
                        }}
                        className={`
                          text-xs px-1 py-0.5 rounded truncate text-white
                          ${statusColors[intervention.statut] || "bg-gray-500"}
                          ${onInterventionDrop ? "cursor-grab active:cursor-grabbing" : ""}
                        `}
                        title={intervention.titre}
                      >
                        {intervention.titre}
                      </div>
                    ))}
                    {dayInterventions.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{dayInterventions.length - 2} autres
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Légende */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
            {Object.entries(statusLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${statusColors[key]}`} />
                <span className="text-sm text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Panneau latéral */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {selectedDate
                ? format(selectedDate, "EEEE d MMMM", { locale: fr })
                : "Sélectionnez une date"}
            </CardTitle>
            {selectedDate && onAddClick && (
              <Button size="sm" onClick={() => onAddClick(selectedDate)}>
                <Plus className="h-4 w-4 mr-1" />
                Ajouter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedDate ? (
            selectedDateInterventions.length > 0 ? (
              <div className="space-y-3">
                {selectedDateInterventions.map((intervention) => (
                  <button
                    key={intervention.id}
                    onClick={() => onInterventionClick?.(intervention)}
                    className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{intervention.titre}</p>
                        {intervention.client && (
                          <p className="text-sm text-muted-foreground">
                            {intervention.client.prenom} {intervention.client.nom}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(intervention.dateDebut), "HH:mm", { locale: fr })}
                          {intervention.dateFin && (
                            <> - {format(new Date(intervention.dateFin), "HH:mm", { locale: fr })}</>
                          )}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${statusColors[intervention.statut]} text-white text-xs`}
                      >
                        {statusLabels[intervention.statut] || intervention.statut}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Aucune intervention prévue</p>
                {onAddClick && (
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={() => onAddClick(selectedDate)}
                  >
                    Planifier une intervention
                  </Button>
                )}
              </div>
            )
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Cliquez sur une date pour voir les interventions</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
