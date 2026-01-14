import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  Clock,
  MapPin,
  User,
  ArrowRight
} from "lucide-react";

const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

interface CalendarWidgetProps {
  className?: string;
}

export default function CalendarWidget({ className }: CalendarWidgetProps) {
  const { data: interventionsData } = trpc.interventions.list.useQuery();
  const { data: chantiers } = trpc.chantiers.list.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Transformer les interventions avec les informations des chantiers
  const interventions = useMemo(() => {
    if (!interventionsData || !chantiers) return [];
    
    const chantierMap = new Map(chantiers.map(c => [c.id, c]));
    const technicienMap = new Map<number, any>(techniciens?.map((t) => [t.id, t]) || []);
    
    return interventionsData.map((intervention) => {
      const technicien = technicienMap.get(intervention.technicienId || 0);
      return {
        id: intervention.id,
        titre: intervention.titre || "Intervention",
        description: intervention.description,
        technicienNom: technicien ? `${(technicien as any).prenom || ''} ${(technicien as any).nom}`.trim() : null,
        dateDebut: intervention.dateDebut?.toString() || new Date().toISOString(),
        dateFin: intervention.dateFin?.toString() || null,
        statut: intervention.statut || "planifiee",
        adresse: intervention.adresse,
      };
    });
  }, [interventionsData, chantiers, techniciens]);

  // Interventions du jour
  const todayInterventions = useMemo(() => {
    const todayStr = today.toISOString().split('T')[0];
    return interventions.filter(i => {
      const interventionDate = new Date(i.dateDebut).toISOString().split('T')[0];
      return interventionDate === todayStr;
    });
  }, [interventions, today]);

  // Interventions de la semaine
  const weekInterventions = useMemo(() => {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    return interventions.filter(i => {
      const interventionDate = new Date(i.dateDebut);
      return interventionDate >= startOfWeek && interventionDate <= endOfWeek;
    }).slice(0, 5);
  }, [interventions, today]);

  // Générer les jours du mois pour le mini calendrier
  const miniCalendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    
    const days: { date: Date; isCurrentMonth: boolean; hasIntervention: boolean }[] = [];
    
    // Jours du mois précédent
    for (let i = startOffset - 1; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth, -i);
      days.push({ date, isCurrentMonth: false, hasIntervention: false });
    }
    
    // Jours du mois courant
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(currentYear, currentMonth, i);
      const dateStr = date.toISOString().split('T')[0];
      const hasIntervention = interventions.some(int => {
        const intDate = new Date(int.dateDebut).toISOString().split('T')[0];
        return intDate === dateStr;
      });
      days.push({ date, isCurrentMonth: true, hasIntervention });
    }
    
    // Compléter pour avoir 35 jours (5 semaines)
    const remaining = 35 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(currentYear, currentMonth + 1, i);
      days.push({ date, isCurrentMonth: false, hasIntervention: false });
    }
    
    return days;
  }, [currentYear, currentMonth, interventions]);

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'planifiee': return 'bg-blue-500';
      case 'en_cours': return 'bg-yellow-500';
      case 'terminee': return 'bg-green-500';
      case 'annulee': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Calendrier
            </CardTitle>
            <CardDescription>
              {MOIS[currentMonth]} {currentYear}
            </CardDescription>
          </div>
          <Link href="/calendrier-chantiers">
            <Button variant="ghost" size="sm">
              Voir tout
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini calendrier */}
        <div className="border rounded-lg p-2">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {JOURS_COURTS.map(jour => (
              <div key={jour} className="text-center text-xs font-medium text-muted-foreground">
                {jour.charAt(0)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {miniCalendarDays.map(({ date, isCurrentMonth, hasIntervention }, index) => (
              <div
                key={index}
                className={`
                  relative text-center text-xs p-1 rounded
                  ${!isCurrentMonth ? 'text-muted-foreground/50' : ''}
                  ${isToday(date) ? 'bg-primary text-primary-foreground font-bold' : ''}
                  ${hasIntervention && !isToday(date) ? 'font-semibold' : ''}
                `}
              >
                {date.getDate()}
                {hasIntervention && (
                  <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isToday(date) ? 'bg-primary-foreground' : 'bg-primary'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Interventions du jour */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Aujourd'hui ({todayInterventions.length})
          </h4>
          {todayInterventions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune intervention prévue</p>
          ) : (
            <div className="space-y-2">
              {todayInterventions.slice(0, 3).map(intervention => (
                <div
                  key={intervention.id}
                  className="flex items-start gap-2 p-2 bg-muted rounded-lg"
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${getStatutColor(intervention.statut)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{intervention.titre}</p>
                    {intervention.technicienNom && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {intervention.technicienNom}
                      </p>
                    )}
                    {intervention.adresse && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3" />
                        {intervention.adresse}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {todayInterventions.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{todayInterventions.length - 3} autre(s)
                </p>
              )}
            </div>
          )}
        </div>

        {/* Interventions de la semaine */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Cette semaine</h4>
          {weekInterventions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune intervention cette semaine</p>
          ) : (
            <div className="space-y-1">
              {weekInterventions.map(intervention => (
                <div
                  key={intervention.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatutColor(intervention.statut)}`} />
                    <span className="truncate">{intervention.titre}</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                    {new Date(intervention.dateDebut).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Statistiques rapides */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{todayInterventions.length}</p>
            <p className="text-xs text-muted-foreground">Aujourd'hui</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{weekInterventions.length}</p>
            <p className="text-xs text-muted-foreground">Cette semaine</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">{interventions.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
