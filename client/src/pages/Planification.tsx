import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation, Clock, User, Check, AlertCircle, Route, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapView } from "@/components/Map";
import { toast } from "sonner";

interface Suggestion {
  technicien: {
    id: number;
    nom: string;
    couleur: string | null;
    specialite: string | null;
  };
  distance: number;
  tempsTrajet: number;
  disponible: boolean;
  position: {
    latitude: string;
    longitude: string;
  } | null;
  score: number;
}

export default function Planification() {
  const [adresse, setAdresse] = useState("");
  const [dateIntervention, setDateIntervention] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedTechnicien, setSelectedTechnicien] = useState<number | null>(null);
  const [selectedIntervention, setSelectedIntervention] = useState<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const { data: interventions } = trpc.interventions.list.useQuery();
  const { data: suggestions, refetch: refetchSuggestions, isLoading: loadingSuggestions } = trpc.interventions.getSuggestionsTechniciens.useQuery(
    {
      latitude: coords?.lat || 0,
      longitude: coords?.lng || 0,
      dateIntervention: dateIntervention,
    },
    { enabled: !!coords }
  );

  const assignerMutation = trpc.interventions.assignerTechnicien.useMutation({
    onSuccess: () => {
      toast.success("Technicien assigné avec succès");
      setSelectedTechnicien(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Géocoder l'adresse via Nominatim (OpenStreetMap)
  const geocodeAdresse = useCallback(async () => {
    if (!adresse) return;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}&limit=1&countrycodes=fr`,
        { headers: { "Accept-Language": "fr" } }
      );
      const results = await response.json();

      if (results.length > 0) {
        const newCoords = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
        setCoords(newCoords);

        if (mapRef.current) {
          mapRef.current.setView([newCoords.lat, newCoords.lng], 14);
        }
      } else {
        toast.error("Adresse non trouvée");
      }
    } catch {
      toast.error("Erreur lors de la recherche d'adresse");
    }
  }, [adresse]);

  // Callback quand la carte est prête
  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  // Mettre à jour les marqueurs sur la carte
  useEffect(() => {
    if (!mapRef.current || typeof L === "undefined") return;

    // Supprimer les anciens marqueurs
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Ajouter le marqueur de destination
    if (coords) {
      const destIcon = L.divIcon({
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        html: `
          <div style="
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="1">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3" fill="white"/>
            </svg>
          </div>
        `,
      });
      const destMarker = L.marker([coords.lat, coords.lng], { icon: destIcon })
        .addTo(mapRef.current)
        .bindPopup("Destination");
      markersRef.current.push(destMarker);
    }

    // Ajouter les marqueurs des techniciens
    if (suggestions) {
      suggestions.forEach((suggestion: Suggestion) => {
        if (suggestion.position) {
          const icon = L.divIcon({
            className: "",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16],
            html: `
              <div style="
                background-color: ${suggestion.technicien.couleur || "#3B82F6"};
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 3px solid ${suggestion.disponible ? "#22c55e" : "#ef4444"};
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                cursor: pointer;
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            `,
          });

          const marker = L.marker(
            [parseFloat(suggestion.position.latitude), parseFloat(suggestion.position.longitude)],
            { icon, title: suggestion.technicien.nom }
          ).addTo(mapRef.current!);

          marker.bindPopup(`
            <strong>${suggestion.technicien.nom}</strong><br/>
            ${suggestion.technicien.specialite || ""}<br/>
            ${suggestion.distance} km - ~${suggestion.tempsTrajet} min
          `);

          marker.on("click", () => {
            setSelectedTechnicien(suggestion.technicien.id);
          });

          markersRef.current.push(marker);
        }
      });
    }
  }, [coords, suggestions]);

  const handleAssigner = () => {
    if (!selectedIntervention || !selectedTechnicien) {
      toast.error("Veuillez sélectionner une intervention et un technicien");
      return;
    }

    assignerMutation.mutate({
      interventionId: selectedIntervention,
      technicienId: selectedTechnicien,
    });
  };

  const interventionsNonAssignees = interventions?.filter(i => !i.technicienId && i.statut === "planifiee") || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Planification Intelligente</h1>
        <p className="text-muted-foreground">
          Trouvez le technicien le plus proche et disponible pour vos interventions
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panneau de recherche */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recherche</CardTitle>
              <CardDescription>
                Entrez l'adresse de l'intervention pour trouver les techniciens disponibles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Adresse de l'intervention</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="123 rue de Paris, 75001 Paris"
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && geocodeAdresse()}
                  />
                  <Button onClick={geocodeAdresse} size="icon">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Date et heure</Label>
                <Input
                  type="datetime-local"
                  value={dateIntervention}
                  onChange={(e) => setDateIntervention(e.target.value)}
                />
              </div>

              {interventionsNonAssignees.length > 0 && (
                <div className="space-y-2">
                  <Label>Intervention à assigner</Label>
                  <Select
                    value={selectedIntervention?.toString() || ""}
                    onValueChange={(v) => setSelectedIntervention(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une intervention" />
                    </SelectTrigger>
                    <SelectContent>
                      {interventionsNonAssignees.map((intervention) => (
                        <SelectItem key={intervention.id} value={intervention.id.toString()}>
                          {intervention.titre} - {format(new Date(intervention.dateDebut), "dd/MM HH:mm", { locale: fr })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {coords && (
                <Button
                  onClick={() => refetchSuggestions()}
                  className="w-full"
                  disabled={loadingSuggestions}
                >
                  <Route className="h-4 w-4 mr-2" />
                  {loadingSuggestions ? "Recherche..." : "Rechercher les techniciens"}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Liste des suggestions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Techniciens suggérés</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
              {loadingSuggestions ? (
                <p className="text-muted-foreground text-center py-4">Recherche en cours...</p>
              ) : suggestions && suggestions.length > 0 ? (
                suggestions.map((suggestion: Suggestion, index: number) => (
                  <div
                    key={suggestion.technicien.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTechnicien === suggestion.technicien.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedTechnicien(suggestion.technicien.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {index === 0 && suggestion.disponible && (
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            Recommandé
                          </Badge>
                        )}
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: suggestion.technicien.couleur || "#3B82F6" }}
                        />
                        <span className="font-medium">{suggestion.technicien.nom}</span>
                      </div>
                      {suggestion.disponible ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Check className="h-3 w-3 mr-1" />
                          Disponible
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-600">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Indisponible
                        </Badge>
                      )}
                    </div>

                    {suggestion.technicien.specialite && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {suggestion.technicien.specialite}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {suggestion.position && (
                        <>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>{suggestion.distance} km</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>~{suggestion.tempsTrajet} min</span>
                          </div>
                        </>
                      )}
                      {!suggestion.position && (
                        <span className="text-xs">Position inconnue</span>
                      )}
                    </div>
                  </div>
                ))
              ) : coords ? (
                <div className="text-center py-4">
                  <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Aucun technicien trouvé
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Entrez une adresse pour commencer
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bouton d'assignation */}
          {selectedTechnicien && selectedIntervention && (
            <Button
              onClick={handleAssigner}
              className="w-full"
              disabled={assignerMutation.isPending}
            >
              <Check className="h-4 w-4 mr-2" />
              {assignerMutation.isPending ? "Assignation..." : "Assigner ce technicien"}
            </Button>
          )}
        </div>

        {/* Carte */}
        <div className="lg:col-span-2">
          <Card className="h-[700px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Navigation className="h-5 w-5" />
                Carte des techniciens
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-60px)] p-0">
              <MapView
                className="w-full h-full rounded-b-lg"
                initialCenter={{ lat: 48.8566, lng: 2.3522 }}
                initialZoom={12}
                onMapReady={handleMapReady}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Légende */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500" />
              <span>Destination</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-green-500 bg-primary" />
              <span>Technicien disponible</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-red-500 bg-primary" />
              <span>Technicien indisponible</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
