import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Battery, RefreshCw, Car, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapView } from "@/components/Map";

// Matches the shape returned by getAllTechniciensPositions:
// { ...technicien, position: lastPosition | null }
interface TechWithPosition {
  id: number;
  nom: string;
  prenom: string | null;
  couleur: string | null;
  specialite: string | null;
  statut: string;
  position: {
    latitude: string;
    longitude: string;
    timestamp: Date;
    enDeplacement: boolean | null;
    batterie: number | null;
    vitesse: string | null;
  } | null;
}

export default function Geolocalisation() {
  const [selectedTechnicien, setSelectedTechnicien] = useState<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  const { data: allTechs, isLoading, refetch } = trpc.geolocalisation.getPositions.useQuery();
  const { data: techniciens } = trpc.techniciens.getAll.useQuery();

  // Only show techs with a position
  const positions = (allTechs as TechWithPosition[] | undefined)?.filter(
    (t): t is TechWithPosition & { position: NonNullable<TechWithPosition["position"]> } =>
      t.position !== null
  );

  // Auto-refresh toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Créer une icône personnalisée avec la couleur du technicien
  const createMarkerIcon = useCallback((couleur: string, enDeplacement: boolean | null) => {
    return L.divIcon({
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
      html: `
        <div style="
          background-color: ${couleur};
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
      `,
    });
  }, []);

  // Créer le contenu du popup
  const createPopupContent = useCallback((tech: TechWithPosition & { position: NonNullable<TechWithPosition["position"]> }) => {
    return `
      <div style="padding: 8px; min-width: 200px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background-color: ${tech.couleur || "#3B82F6"};
          "></div>
          <strong style="font-size: 14px;">${tech.nom}${tech.prenom ? " " + tech.prenom : ""}</strong>
        </div>
        ${tech.specialite ? `<p style="color: #666; font-size: 12px; margin: 4px 0;">${tech.specialite}</p>` : ""}
        <div style="font-size: 12px; color: #666; margin-top: 8px;">
          <p>📍 ${parseFloat(tech.position.latitude).toFixed(6)}, ${parseFloat(tech.position.longitude).toFixed(6)}</p>
          <p>🕐 Dernière mise à jour: ${format(new Date(tech.position.timestamp), "HH:mm", { locale: fr })}</p>
          ${tech.position.batterie ? `<p>🔋 Batterie: ${tech.position.batterie}%</p>` : ""}
          ${tech.position.vitesse && parseFloat(tech.position.vitesse) > 0 ? `<p>🚗 Vitesse: ${parseFloat(tech.position.vitesse).toFixed(0)} km/h</p>` : ""}
          <p style="margin-top: 4px;">
            ${tech.position.enDeplacement
              ? '<span style="color: #22c55e;">● En déplacement</span>'
              : '<span style="color: #6b7280;">● Stationnaire</span>'}
          </p>
        </div>
      </div>
    `;
  }, []);

  // Mettre à jour les marqueurs sur la carte
  const updateMarkers = useCallback((map: L.Map, data: (TechWithPosition & { position: NonNullable<TechWithPosition["position"]> })[]) => {
    if (typeof L === "undefined") return;

    // Supprimer les marqueurs des techniciens qui ne sont plus dans la liste
    const currentIds = new Set(data.map(t => t.id));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Créer ou mettre à jour les marqueurs
    data.forEach((tech) => {
      const latLng: L.LatLngExpression = [
        parseFloat(tech.position.latitude),
        parseFloat(tech.position.longitude),
      ];
      let marker = markersRef.current.get(tech.id);

      if (marker) {
        marker.setLatLng(latLng);
        marker.setIcon(createMarkerIcon(tech.couleur || "#3B82F6", tech.position.enDeplacement));
        marker.setPopupContent(createPopupContent(tech));
      } else {
        marker = L.marker(latLng, {
          icon: createMarkerIcon(tech.couleur || "#3B82F6", tech.position.enDeplacement),
          title: tech.nom,
        }).addTo(map);

        marker.bindPopup(createPopupContent(tech));

        marker.on("click", () => {
          setSelectedTechnicien(tech.id);
        });

        markersRef.current.set(tech.id, marker);
      }
    });

    // Ajuster la vue pour montrer tous les marqueurs
    if (data.length > 0) {
      const bounds = L.latLngBounds(
        data.map(t => [parseFloat(t.position.latitude), parseFloat(t.position.longitude)] as L.LatLngExpression)
      );

      if (data.length === 1) {
        map.setView(bounds.getCenter(), 15);
      } else {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [createMarkerIcon, createPopupContent]);

  // Callback quand la carte est prête
  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;

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
  const centerOnTechnicien = useCallback((techId: number) => {
    const tech = positions?.find(t => t.id === techId);
    if (tech && mapRef.current) {
      mapRef.current.setView(
        [parseFloat(tech.position.latitude), parseFloat(tech.position.longitude)],
        16,
      );
      setSelectedTechnicien(techId);

      const marker = markersRef.current.get(techId);
      if (marker) {
        marker.openPopup();
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
                positions.map((tech) => (
                  <div
                    key={tech.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTechnicien === tech.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => centerOnTechnicien(tech.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tech.couleur || "#3B82F6" }}
                        />
                        <span className="font-medium">{tech.nom}{tech.prenom ? ` ${tech.prenom}` : ""}</span>
                      </div>
                      {getStatutBadge(tech.position.enDeplacement)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(new Date(tech.position.timestamp), "HH:mm", { locale: fr })}
                        </span>
                      </div>
                      {tech.position.batterie && (
                        <div className="flex items-center gap-2">
                          <Battery className={`h-3 w-3 ${getBatterieColor(tech.position.batterie)}`} />
                          <span>{tech.position.batterie}%</span>
                        </div>
                      )}
                      {tech.position.vitesse && parseFloat(tech.position.vitesse) > 0 && (
                        <div className="flex items-center gap-2">
                          <Car className="h-3 w-3" />
                          <span>{parseFloat(tech.position.vitesse).toFixed(0)} km/h</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {positions?.filter(t => t.position.enDeplacement).length || 0}
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

        {/* Carte Leaflet */}
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
                initialCenter={{ lat: 48.8566, lng: 2.3522 }}
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
