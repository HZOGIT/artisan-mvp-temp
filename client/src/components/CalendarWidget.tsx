import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Calendar as CalendarIcon, 
  Clock,
  MapPin,
  User,
  ArrowRight,
  Settings2,
  Share2,
  Copy,
  Download,
  Upload
} from "lucide-react";

const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

interface WidgetSettings {
  showMiniCalendar: boolean;
  showTodayInterventions: boolean;
  showWeekInterventions: boolean;
  showStatistics: boolean;
  showTechnicien: boolean;
  showAdresse: boolean;
}

const DEFAULT_SETTINGS: WidgetSettings = {
  showMiniCalendar: true,
  showTodayInterventions: true,
  showWeekInterventions: true,
  showStatistics: true,
  showTechnicien: true,
  showAdresse: true,
};

interface CalendarWidgetProps {
  className?: string;
}

export default function CalendarWidget({ className }: CalendarWidgetProps) {
  const [settings, setSettings] = useState<WidgetSettings>(() => {
    const saved = localStorage.getItem('calendarWidgetSettings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [importCode, setImportCode] = useState("");

  const { data: interventionsData } = trpc.interventions.list.useQuery();
  const { data: chantiers } = trpc.chantiers.list.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Sauvegarder les préférences
  useEffect(() => {
    localStorage.setItem('calendarWidgetSettings', JSON.stringify(settings));
  }, [settings]);

  const updateSetting = (key: keyof WidgetSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Générer un code de partage
  const generateShareCode = () => {
    const code = btoa(JSON.stringify(settings));
    setShareCode(code);
    setShowShareDialog(true);
  };

  // Copier le code de partage
  const copyShareCode = () => {
    navigator.clipboard.writeText(shareCode);
    toast.success("Code copié dans le presse-papiers");
  };

  // Importer une configuration
  const importConfiguration = () => {
    try {
      const decoded = JSON.parse(atob(importCode));
      if (typeof decoded === 'object' && 'showMiniCalendar' in decoded) {
        setSettings(decoded);
        toast.success("Configuration importée avec succès");
        setImportCode("");
        setShowShareDialog(false);
      } else {
        toast.error("Code de configuration invalide");
      }
    } catch (e) {
      toast.error("Code de configuration invalide");
    }
  };

  // Réinitialiser la configuration
  const resetConfiguration = () => {
    setSettings(DEFAULT_SETTINGS);
    toast.success("Configuration réinitialisée");
  };

  // Transformer les interventions avec les informations des chantiers
  const interventions = useMemo(() => {
    if (!interventionsData) return [];
    
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
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Personnaliser l'affichage</h4>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="showMiniCalendar"
                        checked={settings.showMiniCalendar}
                        onCheckedChange={(checked) => updateSetting('showMiniCalendar', checked as boolean)}
                      />
                      <Label htmlFor="showMiniCalendar" className="text-sm">Mini calendrier</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="showTodayInterventions"
                        checked={settings.showTodayInterventions}
                        onCheckedChange={(checked) => updateSetting('showTodayInterventions', checked as boolean)}
                      />
                      <Label htmlFor="showTodayInterventions" className="text-sm">Interventions du jour</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="showWeekInterventions"
                        checked={settings.showWeekInterventions}
                        onCheckedChange={(checked) => updateSetting('showWeekInterventions', checked as boolean)}
                      />
                      <Label htmlFor="showWeekInterventions" className="text-sm">Interventions de la semaine</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="showStatistics"
                        checked={settings.showStatistics}
                        onCheckedChange={(checked) => updateSetting('showStatistics', checked as boolean)}
                      />
                      <Label htmlFor="showStatistics" className="text-sm">Statistiques</Label>
                    </div>
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs text-muted-foreground mb-2">Détails des interventions</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="showTechnicien"
                          checked={settings.showTechnicien}
                          onCheckedChange={(checked) => updateSetting('showTechnicien', checked as boolean)}
                        />
                        <Label htmlFor="showTechnicien" className="text-sm">Technicien</Label>
                      </div>
                      <div className="flex items-center space-x-2 mt-2">
                        <Checkbox
                          id="showAdresse"
                          checked={settings.showAdresse}
                          onCheckedChange={(checked) => updateSetting('showAdresse', checked as boolean)}
                        />
                        <Label htmlFor="showAdresse" className="text-sm">Adresse</Label>
                      </div>
                    </div>
                  </div>
                  <div className="border-t pt-3 mt-3">
                    <Button variant="outline" size="sm" className="w-full" onClick={generateShareCode}>
                      <Share2 className="h-4 w-4 mr-2" />
                      Partager cette configuration
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Link href="/calendrier-chantiers">
              <Button variant="ghost" size="sm">
                Voir tout
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini calendrier */}
        {settings.showMiniCalendar && (
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
        )}

        {/* Interventions du jour */}
        {settings.showTodayInterventions && (
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
                      {settings.showTechnicien && intervention.technicienNom && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {intervention.technicienNom}
                        </p>
                      )}
                      {settings.showAdresse && intervention.adresse && (
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
        )}

        {/* Interventions de la semaine */}
        {settings.showWeekInterventions && (
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
        )}

        {/* Statistiques rapides */}
        {settings.showStatistics && (
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
        )}
      </CardContent>

      {/* Dialogue de partage */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Partager la configuration
            </DialogTitle>
            <DialogDescription>
              Partagez votre configuration de widget avec d'autres membres de l'équipe
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Code de partage */}
            <div>
              <Label className="text-sm font-medium">Votre code de configuration</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={shareCode}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={copyShareCode}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Envoyez ce code à un collègue pour qu'il puisse importer votre configuration
              </p>
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium">Importer une configuration</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Collez le code ici..."
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button variant="outline" onClick={importConfiguration} disabled={!importCode}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importer
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={resetConfiguration}>
              Réinitialiser
            </Button>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
