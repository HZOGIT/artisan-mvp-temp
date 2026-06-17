import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { MapPin, Navigation, Clock, User, Check, AlertCircle, Route, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Badge } from "@/modern/shared/ui/badge";
import { Input } from "@/modern/shared/ui/input";
import { Label } from "@/modern/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { MapView } from "@/components/Map";
import { usePlanification, type Coords } from "../application/use-planification";
import { interventionsNonAssignees, conflictCounts, destMarkerHtml, techMarkerHtml, techPopupHtml } from "../domain/planification";

// Page `planification` — migration clean-archi de `pages/Planification.tsx`. Carte Leaflet impérative en UI ;
// constructeurs HTML marqueurs + règles (filtre interventions, conflits) en domain (purs, testés).
export default function PlanificationPage() {
  const { t } = useTranslation("planification");
  const [adresse, setAdresse] = useState("");
  const [dateIntervention, setDateIntervention] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [coords, setCoords] = useState<Coords | null>(null);
  const [selectedTechnicien, setSelectedTechnicien] = useState<number | null>(null);
  const [selectedIntervention, setSelectedIntervention] = useState<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const { interventions, suggestions, loadingSuggestions, refetchSuggestions, assigner } = usePlanification(coords, dateIntervention);
  const nonAssignees = useMemo(() => interventionsNonAssignees(interventions), [interventions]);
  const unites = useMemo(() => ({ km: t("uniteKm"), min: t("uniteMin") }), [t]);

  const geocodeAdresse = useCallback(async () => {
    if (!adresse) return;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}&limit=1&countrycodes=fr`, { headers: { "Accept-Language": "fr" } });
      const results: Array<{ lat: string; lon: string }> = await response.json();
      if (results.length > 0) {
        const newCoords = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
        setCoords(newCoords);
        mapRef.current?.setView([newCoords.lat, newCoords.lng], 14);
      } else {
        toast.error(t("errAdresseNonTrouvee"));
      }
    } catch {
      toast.error(t("errGeocode"));
    }
  }, [adresse, t]);

  const handleMapReady = useCallback((map: L.Map) => { mapRef.current = map; }, []);

  // Marqueurs : destination + techniciens suggérés.
  useEffect(() => {
    if (!mapRef.current || typeof L === "undefined") return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (coords) {
      const destIcon = L.divIcon({ className: "", iconSize: [32, 32], iconAnchor: [16, 32], html: destMarkerHtml() });
      markersRef.current.push(L.marker([coords.lat, coords.lng], { icon: destIcon }).addTo(mapRef.current).bindPopup(t("destination")));
    }
    suggestions.forEach((s) => {
      if (!s.position) return;
      const icon = L.divIcon({ className: "", iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16], html: techMarkerHtml(s.technicien.couleur || "#3B82F6", s.disponible) });
      const marker = L.marker([parseFloat(s.position.latitude), parseFloat(s.position.longitude)], { icon, title: s.technicien.nom }).addTo(mapRef.current!);
      marker.bindPopup(techPopupHtml(s, unites));
      marker.on("click", () => setSelectedTechnicien(s.technicien.id));
      markersRef.current.push(marker);
    });
  }, [coords, suggestions, unites, t]);

  const handleAssigner = () => {
    if (!selectedIntervention || !selectedTechnicien) { toast.error(t("errSelection")); return; }
    assigner.mutate(
      { interventionId: selectedIntervention, technicienId: selectedTechnicien },
      {
        onSuccess: (data) => {
          const { nbInter, nbConge } = conflictCounts(data);
          if (nbInter > 0 || nbConge > 0) {
            const parts: string[] = [];
            if (nbInter > 0) parts.push(t("conflitInterventions", { n: nbInter }));
            if (nbConge > 0) parts.push(t("conflitConge"));
            toast.warning(t("toastConflit", { details: parts.join(" + ") }));
          } else {
            toast.success(t("toastAssigne"));
          }
          setSelectedTechnicien(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
        <p className="text-muted-foreground">{t("sousTitre")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("recherche")}</CardTitle>
              <CardDescription>{t("rechercheDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("adresse")}</Label>
                <div className="flex gap-2">
                  <Input placeholder={t("adressePlaceholder")} value={adresse} onChange={(e) => setAdresse(e.target.value)} onKeyDown={(e) => e.key === "Enter" && geocodeAdresse()} />
                  <Button onClick={geocodeAdresse} size="icon"><Search className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("dateHeure")}</Label>
                <Input type="datetime-local" value={dateIntervention} onChange={(e) => setDateIntervention(e.target.value)} />
              </div>
              {nonAssignees.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("interventionAssigner")}</Label>
                  <Select value={selectedIntervention?.toString() || ""} onValueChange={(v) => setSelectedIntervention(parseInt(v))}>
                    <SelectTrigger><SelectValue placeholder={t("selInterventionPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {nonAssignees.map((intervention) => (
                        <SelectItem key={intervention.id} value={intervention.id.toString()}>
                          {intervention.titre} - {format(new Date(intervention.dateDebut), "dd/MM HH:mm", { locale: fr })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {coords && (
                <Button onClick={() => refetchSuggestions()} className="w-full" disabled={loadingSuggestions}>
                  <Route className="h-4 w-4 mr-2" />{loadingSuggestions ? t("recherchEnCours") : t("rechercherTechniciens")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">{t("techniciensSuggeres")}</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
              {loadingSuggestions ? (
                <p className="text-muted-foreground text-center py-4">{t("rechercheEnCoursLong")}</p>
              ) : suggestions.length > 0 ? (
                suggestions.map((suggestion, index) => (
                  <div key={suggestion.technicien.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedTechnicien === suggestion.technicien.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => setSelectedTechnicien(suggestion.technicien.id)}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {index === 0 && suggestion.disponible && <Badge className="bg-green-100 text-green-800 text-xs">{t("recommande")}</Badge>}
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: suggestion.technicien.couleur || "#3B82F6" }} />
                        <span className="font-medium">{suggestion.technicien.nom}</span>
                      </div>
                      {suggestion.disponible ? (
                        <Badge variant="outline" className="text-green-600 border-green-600"><Check className="h-3 w-3 mr-1" />{t("disponible")}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-600"><AlertCircle className="h-3 w-3 mr-1" />{t("indisponible")}</Badge>
                      )}
                    </div>
                    {suggestion.technicien.specialite && <p className="text-xs text-muted-foreground mb-2">{suggestion.technicien.specialite}</p>}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {suggestion.position ? (
                        <>
                          <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /><span>{t("km", { n: suggestion.distance })}</span></div>
                          <div className="flex items-center gap-1"><Clock className="h-3 w-3" /><span>{t("min", { n: suggestion.tempsTrajet })}</span></div>
                        </>
                      ) : (
                        <span className="text-xs">{t("positionInconnue")}</span>
                      )}
                    </div>
                  </div>
                ))
              ) : coords ? (
                <div className="text-center py-4">
                  <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{t("aucunTechnicien")}</p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{t("entrezAdresse")}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedTechnicien && selectedIntervention && (
            <Button onClick={handleAssigner} className="w-full" disabled={assigner.isPending}>
              <Check className="h-4 w-4 mr-2" />{assigner.isPending ? t("assignation") : t("assignerTechnicien")}
            </Button>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card className="h-[700px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><Navigation className="h-5 w-5" />{t("carteTechniciens")}</CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-60px)] p-0">
              <MapView className="w-full h-full rounded-b-lg" initialCenter={{ lat: 48.8566, lng: 2.3522 }} initialZoom={12} onMapReady={handleMapReady} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-red-500" /><span>{t("destination")}</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-green-500 bg-primary" /><span>{t("techDisponible")}</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-red-500 bg-primary" /><span>{t("techIndisponible")}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
