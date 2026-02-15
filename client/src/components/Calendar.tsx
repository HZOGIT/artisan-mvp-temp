import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Columns3 } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
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

type ViewMode = "month" | "week";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7h - 20h

export default function Calendar({ interventions, onDateClick, onInterventionClick, onAddClick, onInterventionDrop }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const weekGridRef = useRef<HTMLDivElement>(null);

  // Scroll to 8h on mount for week view
  useEffect(() => {
    if (viewMode === "week" && weekGridRef.current) {
      const row8h = weekGridRef.current.querySelector("[data-hour='8']");
      if (row8h) {
        row8h.scrollIntoView({ block: "start" });
      }
    }
  }, [viewMode]);

  // Month view data
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Week view data
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

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

  const handlePrev = () => {
    if (viewMode === "month") setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subWeeks(currentDate, 1));
  };
  const handleNext = () => {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addWeeks(currentDate, 1));
  };
  const handleToday = () => setCurrentDate(new Date());

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateClick?.(date);
  };

  const selectedDateInterventions = selectedDate
    ? interventionsByDate.get(format(selectedDate, "yyyy-MM-dd")) || []
    : [];

  const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const headerTitle = viewMode === "month"
    ? format(currentDate, "MMMM yyyy", { locale: fr })
    : `${format(weekStart, "d MMM", { locale: fr })} - ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: fr })}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-xl capitalize">
              {headerTitle}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode("month")}
                  className={`px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${viewMode === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Mois
                </button>
                <button
                  onClick={() => setViewMode("week")}
                  className={`px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${viewMode === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  Semaine
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={handleToday}>
                Aujourd'hui
              </Button>
              <Button variant="ghost" size="icon" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "month" ? (
            <MonthView
              days={monthDays}
              currentDate={currentDate}
              selectedDate={selectedDate}
              interventionsByDate={interventionsByDate}
              dragOverSlot={dragOverSlot}
              setDragOverSlot={setDragOverSlot}
              onDateClick={handleDateClick}
              onInterventionDrop={onInterventionDrop}
              dayLabels={dayLabels}
            />
          ) : (
            <WeekView
              weekDays={weekDays}
              selectedDate={selectedDate}
              interventionsByDate={interventionsByDate}
              dragOverSlot={dragOverSlot}
              setDragOverSlot={setDragOverSlot}
              onDateClick={handleDateClick}
              onInterventionClick={onInterventionClick}
              onInterventionDrop={onInterventionDrop}
              onAddClick={onAddClick}
              weekGridRef={weekGridRef}
            />
          )}

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

/* ───────── MONTH VIEW ───────── */

function MonthView({
  days,
  currentDate,
  selectedDate,
  interventionsByDate,
  dragOverSlot,
  setDragOverSlot,
  onDateClick,
  onInterventionDrop,
  dayLabels,
}: {
  days: Date[];
  currentDate: Date;
  selectedDate: Date | null;
  interventionsByDate: Map<string, Intervention[]>;
  dragOverSlot: string | null;
  setDragOverSlot: (s: string | null) => void;
  onDateClick: (d: Date) => void;
  onInterventionDrop?: (id: number, d: Date) => void;
  dayLabels: string[];
}) {
  return (
    <>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayLabels.map((day) => (
          <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>
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
              onClick={() => onDateClick(day)}
              onDragOver={(e) => {
                if (!onInterventionDrop) return;
                e.preventDefault();
                setDragOverSlot(dateKey);
              }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverSlot(null);
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
                ${dragOverSlot === dateKey ? "ring-2 ring-primary/50 bg-primary/5" : ""}
                hover:bg-accent
              `}
            >
              <span className={`text-sm font-medium ${!isCurrentMonth ? "text-muted-foreground" : ""} ${isToday ? "text-primary font-bold" : ""}`}>
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
                    className={`text-xs px-1 py-0.5 rounded truncate text-white ${statusColors[intervention.statut] || "bg-gray-500"} ${onInterventionDrop ? "cursor-grab active:cursor-grabbing" : ""}`}
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
    </>
  );
}

/* ───────── WEEK VIEW ───────── */

function WeekView({
  weekDays,
  selectedDate,
  interventionsByDate,
  dragOverSlot,
  setDragOverSlot,
  onDateClick,
  onInterventionClick,
  onInterventionDrop,
  onAddClick,
  weekGridRef,
}: {
  weekDays: Date[];
  selectedDate: Date | null;
  interventionsByDate: Map<string, Intervention[]>;
  dragOverSlot: string | null;
  setDragOverSlot: (s: string | null) => void;
  onDateClick: (d: Date) => void;
  onInterventionClick?: (intervention: Intervention) => void;
  onInterventionDrop?: (id: number, d: Date) => void;
  onAddClick?: (date: Date) => void;
  weekGridRef: React.RefObject<HTMLDivElement | null>;
}) {
  // Build a map: "yyyy-MM-dd-HH" -> interventions that start in that hour
  const interventionsBySlot = useMemo(() => {
    const map = new Map<string, Intervention[]>();
    weekDays.forEach((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const dayInterventions = interventionsByDate.get(dateKey) || [];
      dayInterventions.forEach((intervention) => {
        const d = new Date(intervention.dateDebut);
        const hour = d.getHours();
        const slotKey = `${dateKey}-${hour}`;
        if (!map.has(slotKey)) {
          map.set(slotKey, []);
        }
        map.get(slotKey)!.push(intervention);
      });
    });
    return map;
  }, [weekDays, interventionsByDate]);

  return (
    <div ref={weekGridRef} className="overflow-y-auto max-h-[600px] border rounded-lg">
      {/* Header row with day names */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] sticky top-0 z-10 bg-background border-b">
        <div className="border-r p-2 text-xs text-muted-foreground" />
        {weekDays.map((day) => {
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          return (
            <div
              key={format(day, "yyyy-MM-dd")}
              onClick={() => onDateClick(day)}
              className={`p-2 text-center border-r last:border-r-0 cursor-pointer hover:bg-accent transition-colors ${isSelected ? "bg-primary/10" : ""}`}
            >
              <div className="text-xs text-muted-foreground">
                {format(day, "EEE", { locale: fr })}
              </div>
              <div className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}>
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time slot rows */}
      {HOURS.map((hour) => (
        <div key={hour} data-hour={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b last:border-b-0 min-h-[60px]">
          {/* Hour label */}
          <div className="border-r p-1 text-xs text-muted-foreground text-right pr-2 pt-1">
            {String(hour).padStart(2, "0")}:00
          </div>

          {/* Day cells for this hour */}
          {weekDays.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const slotKey = `${dateKey}-${hour}`;
            const slotInterventions = interventionsBySlot.get(slotKey) || [];
            const isNow = isSameDay(day, new Date()) && new Date().getHours() === hour;

            return (
              <div
                key={slotKey}
                onDragOver={(e) => {
                  if (!onInterventionDrop) return;
                  e.preventDefault();
                  setDragOverSlot(slotKey);
                }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverSlot(null);
                  const interventionId = e.dataTransfer.getData("interventionId");
                  if (interventionId && onInterventionDrop) {
                    const targetDate = new Date(day);
                    targetDate.setHours(hour, 0, 0, 0);
                    onInterventionDrop(parseInt(interventionId), targetDate);
                  }
                }}
                onClick={() => {
                  if (onAddClick) {
                    const clickDate = new Date(day);
                    clickDate.setHours(hour, 0, 0, 0);
                    onAddClick(clickDate);
                  }
                }}
                className={`
                  border-r last:border-r-0 p-0.5 transition-colors cursor-pointer relative
                  ${dragOverSlot === slotKey ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : "hover:bg-muted/30"}
                  ${isNow ? "bg-primary/5" : ""}
                `}
              >
                {/* Current time indicator */}
                {isNow && (
                  <div className="absolute left-0 right-0 border-t-2 border-primary/60" style={{ top: `${(new Date().getMinutes() / 60) * 100}%` }} />
                )}

                {slotInterventions.map((intervention) => (
                  <div
                    key={intervention.id}
                    draggable={!!onInterventionDrop}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("interventionId", String(intervention.id));
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onInterventionClick?.(intervention);
                    }}
                    className={`
                      text-xs px-1.5 py-1 rounded mb-0.5 text-white truncate
                      ${statusColors[intervention.statut] || "bg-gray-500"}
                      ${onInterventionDrop ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
                    `}
                    title={`${intervention.titre} - ${format(new Date(intervention.dateDebut), "HH:mm")}`}
                  >
                    <span className="font-medium">{format(new Date(intervention.dateDebut), "HH:mm")}</span>{" "}
                    {intervention.titre}
                    {intervention.client && (
                      <span className="opacity-80"> - {intervention.client.prenom} {intervention.client.nom}</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
