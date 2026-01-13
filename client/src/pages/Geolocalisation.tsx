import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock, Battery, RefreshCw, Car, User, Route } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapView } from "@/components/Map";

interface TechnicienPosition {
  technicien: {
    id: number;
    nom: string;
    couleur: string | null;
    specialite: string | null;
  };
  latitude: string;
  longitude: string;
  timestamp: Date;
  enDeplacement: boolean | null;
  batterie: number | null;
  vitesse: string | null;
}

export default function Geolocalisation() {
  const [selectedTechnicien, setSelectedTechnicien] = useState<number | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  
  const { data: positions, isLoading, refetch } = trpc.geolocalisation.getPositions.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();
  
  // Auto-refresh toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Créer un marqueur personnalisé avec la couleur du technicien
  const createMarkerContent = useCallback((technicien: TechnicienPosition["technicien"], enDeplacement: boolean | null) => {
    const div = document.createElement("div");
    div.innerHTML = `
      <div style="
        background-color: ${technicien.couleur || "#3B82F6"};
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
        position: relative;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
        ${enDeplacement ? `
          <div style="
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 12px;
            height: 12px;
            background-color: #22c55e;
            border-radius: 50%;
            border: 2px solid white;
          "></div>
        ` : ""}
      </div>
    `;
    return div;
  }, []);

  // Mettre à jour les marqueurs sur la carte
  const updateMarkers = useCallback((map: google.maps.Map, positionsData: TechnicienPosition[]) => {
    if (!window.google) return;

    // Supprimer les marqueurs des techniciens qui ne sont plus dans la liste
    const currentIds = new Set(positionsData.map(p => p.technicien.id));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    });

    // Créer ou mettre à jour les marqueurs
    positionsData.forEach((pos) => {
      const position = {
        lat: parseFloat(pos.latitude),
        lng: parseFloat(pos.longitude),
      };

      let marker = markersRef.current.get(pos.technicien.id);

      if (marker) {
        // Mettre à jour la position du marqueur existant
        marker.position = position;
        marker.content = createMarkerContent(pos.technicien, pos.enDeplacement);
      } else {
        // Créer un nouveau marqueur
        marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          content: createMarkerContent(pos.technicien, pos.enDeplacement),
          title: pos.technicien.nom,
        });

        // Ajouter l'événement de clic
        marker.addListener("click", () => {
          if (!infoWindowRef.current) {
            infoWindowRef.current = new google.maps.InfoWindow();
          }

          const content = `
            <div style="padding: 8px; min-width: 200px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="
                  width: 12px;
                  height: 12px;
                  border-radius: 50%;
                  background-color: ${pos.technicien.couleur || "#3B82F6"};
                "></div>
                <strong style="font-size: 14px;">${pos.technicien.nom}</strong>
              </div>
              ${pos.technicien.specialite ? `<p style="color: #666; font-size: 12px; margin: 4px 0;">${pos.technicien.specialite}</p>` : ""}
              <div style="font-size: 12px; color: #666; margin-top: 8px;">
                <p>📍 ${parseFloat(pos.latitude).toFixed(6)}, ${parseFloat(pos.longitude).toFixed(6)}</p>
                <p>🕐 Dernière mise à jour: ${format(new Date(pos.timestamp), "HH:mm", { locale: fr })}</p>
                ${pos.batterie ? `<p>🔋 Batterie: ${pos.batterie}%</p>` : ""}
                ${pos.vitesse && parseFloat(pos.vitesse) > 0 ? `<p>🚗 Vitesse: ${parseFloat(pos.vitesse).toFixed(0)} km/h</p>` : ""}
                <p style="margin-top: 4px;">
                  ${pos.enDeplacement 
                    ? '<span style="color: #22c55e;">● En déplacement</span>' 
                    : '<span style="color: #6b7280;">● Stationnaire</span>'}
                </p>
              </div>
            </div>
          `;

          infoWindowRef.current.setContent(content);
          infoWindowRef.current.open(map, marker);
          setSelectedTechnicien(pos.technicien.id);
        });

        markersRef.current.set(pos.technicien.id, marker);
      }
    });

    // Ajuster la vue pour montrer tous les marqueurs
    if (positionsData.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      positionsData.forEach((pos) => {
        bounds.extend({
          lat: parseFloat(pos.latitude),
          lng: parseFloat(pos.longitude),
        });
      });
      
      // Ne pas zoomer trop près si un seul technicien
      if (positionsData.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
      } else {
        map.fitBounds(bounds, 50);
      }
    }
  }, [createMarkerContent]);

  // Callback quand la carte est prête
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    
    // Mettre à jour les marqueurs si les positions sont déjà chargées
    if (positions && positions.length > 0) {
      updateMarkers(map, positions);
    }
  }, [positions, updateMarkers]);

  // Mettre à jour les marqueurs quand les positions changent
  useEffect(() => {
    if (mapRef.current && positions) {
      updateMarkers(mapRef.current, positions);
    }
  }, [positions, updateMarkers]);

  // Centrer sur un technicien sélectionné
  const centerOnTechnicien = useCallback((technicienId: number) => {
    const pos = positions?.find(p => p.technicien.id === technicienId);
    if (pos && mapRef.current) {
      mapRef.current.setCenter({
        lat: parseFloat(pos.latitude),
        lng: parseFloat(pos.longitude),
      });
      mapRef.current.setZoom(16);
      setSelectedTechnicien(technicienId);

      // Ouvrir l'info window
      const marker = markersRef.current.get(technicienId);
      if (marker) {
        google.maps.event.trigger(marker, "click");
      }
    }
  }, [positions]);

  const getStatutBadge = (enDeplacement: boolean | null) => {
    if (enDeplacement) {
      return <Badge className="bg-green-100 text-green-800">En déplacement</Badge>;
    }
    return <Badge variant="secondary">Stationnaire</Badge>;
  };

  const getBatterieColor = (niveau: number | null) => {
    if (!niveau) return "text-gray-400";
    if (niveau > 50) return "text-green-500";
    if (niveau > 20) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Géolocalisation</h1>
          <p className="text-muted-foreground">
            Suivez vos techniciens en temps réel sur la carte
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des techniciens */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Techniciens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <p className="text-muted-foreground">Chargement...</p>
              ) : positions && positions.length > 0 ? (
                positions.map((pos) => (
                  <div
                    key={pos.technicien.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTechnicien === pos.technicien.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => centerOnTechnicien(pos.technicien.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: pos.technicien.couleur || "#3B82F6" }}
                        />
                        <span className="font-medium">{pos.technicien.nom}</span>
                      </div>
                      {getStatutBadge(pos.enDeplacement)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(new Date(pos.timestamp), "HH:mm", { locale: fr })}
                        </span>
                      </div>
                      {pos.batterie && (
                        <div className="flex items-center gap-2">
                          <Battery className={`h-3 w-3 ${getBatterieColor(pos.batterie)}`} />
                          <span>{pos.batterie}%</span>
                        </div>
                      )}
                      {pos.vitesse && parseFloat(pos.vitesse) > 0 && (
                        <div className="flex items-center gap-2">
                          <Car className="h-3 w-3" />
                          <span>{parseFloat(pos.vitesse).toFixed(0)} km/h</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : techniciens && techniciens.length > 0 ? (
                <div className="text-center py-4">
                  <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Aucune position reçue
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Les techniciens doivent activer le mode mobile
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Aucun technicien configuré
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statistiques */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Statistiques</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {positions?.filter(p => p.enDeplacement).length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">En déplacement</p>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-primary">
                    {positions?.length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Actifs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Légende */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Légende</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
                <span>Position du technicien</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>En déplacement</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span>Stationnaire</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Carte Google Maps */}
        <div className="lg:col-span-2">
          <Card className="h-[600px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Carte en temps réel
                {positions && positions.length > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {positions.length} technicien(s)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-60px)] p-0">
              <MapView
                className="w-full h-full rounded-b-lg"
                initialCenter={{ lat: 48.8566, lng: 2.3522 }} // Paris par défaut
                initialZoom={12}
                onMapReady={handleMapReady}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
