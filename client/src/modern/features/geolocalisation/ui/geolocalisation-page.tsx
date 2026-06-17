import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Clock, Battery, RefreshCw, Car, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { Badge } from "@/modern/shared/ui/badge";
import { MapView } from "@/components/Map";
import { useGeolocalisation } from "../application/use-geolocalisation";
import { withPosition, techId, latLng, batterieColor, markerIconHtml, popupContentHtml, type TechWithPos, type PopupLabels } from "../domain/geolocalisation";

// Page `geolocalisation` — migration clean-archi de `pages/Geolocalisation.tsx`. La carte Leaflet (MapView
// partagé) reste impérative en UI ; les constructeurs HTML marqueur/popup vivent en domain (purs, testés).
export default function GeolocalisationPage() {
  const { t } = useTranslation("geolocalisation");
  const { allTechs, isLoading, refetch, techniciens } = useGeolocalisation();
  const [selectedTechnicien, setSelectedTechnicien] = useState<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  const positions = useMemo(() => withPosition(allTechs), [allTechs]);
  const popupLabels: PopupLabels = useMemo(() => ({ maj: t("popupMaj"), batterie: t("popupBatterie"), vitesse: t("popupVitesse"), enDeplacement: t("enDeplacement"), stationnaire: t("stationnaire") }), [t]);

  const createIcon = useCallback((couleur: string, enDeplacement: boolean | null) =>
    L.divIcon({ className: "", iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18], html: markerIconHtml(couleur, enDeplacement) }), []);

  const popupHtml = useCallback((tech: TechWithPos) =>
    popupContentHtml(tech, format(new Date(tech.position.timestamp), "HH:mm", { locale: fr }), popupLabels), [popupLabels]);

  const updateMarkers = useCallback((map: L.Map, data: TechWithPos[]) => {
    if (typeof L === "undefined") return;
    const currentIds = new Set(data.map(techId));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.remove(); markersRef.current.delete(id); }
    });
    data.forEach((tech) => {
      const pos = latLng(tech.position);
      const id = techId(tech);
      let marker = markersRef.current.get(id);
      if (marker) {
        marker.setLatLng(pos);
        marker.setIcon(createIcon(tech.couleur || "#3B82F6", tech.position.enDeplacement));
        marker.setPopupContent(popupHtml(tech));
      } else {
        marker = L.marker(pos, { icon: createIcon(tech.couleur || "#3B82F6", tech.position.enDeplacement), title: tech.nom }).addTo(map);
        marker.bindPopup(popupHtml(tech));
        marker.on("click", () => setSelectedTechnicien(id));
        markersRef.current.set(id, marker);
      }
    });
    if (data.length > 0) {
      const bounds = L.latLngBounds(data.map((t2) => latLng(t2.position) as L.LatLngExpression));
      if (data.length === 1) map.setView(bounds.getCenter(), 15);
      else map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [createIcon, popupHtml]);

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    if (positions.length > 0) updateMarkers(map, positions);
  }, [positions, updateMarkers]);

  useEffect(() => {
    if (mapRef.current) updateMarkers(mapRef.current, positions);
  }, [positions, updateMarkers]);

  const centerOnTechnicien = useCallback((id: number) => {
    const tech = positions.find((tt) => techId(tt) === id);
    if (tech && mapRef.current) {
      mapRef.current.setView(latLng(tech.position), 16);
      setSelectedTechnicien(id);
      markersRef.current.get(id)?.openPopup();
    }
  }, [positions]);

  const statutBadge = (enDeplacement: boolean | null) =>
    enDeplacement ? <Badge className="bg-green-100 text-green-800">{t("enDeplacement")}</Badge> : <Badge variant="secondary">{t("stationnaire")}</Badge>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
          <p className="text-muted-foreground">{t("sousTitre")}</p>
        </div>
        <Button onClick={() => refetch()} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />{t("actualiser")}</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">{t("techniciens")}</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <p className="text-muted-foreground">{t("chargement")}</p>
              ) : positions.length > 0 ? (
                positions.map((tech) => {
                  const id = techId(tech);
                  return (
                    <div key={id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedTechnicien === id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => centerOnTechnicien(id)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tech.couleur || "#3B82F6" }} />
                          <span className="font-medium">{tech.nom}{tech.prenom ? ` ${tech.prenom}` : ""}</span>
                        </div>
                        {statutBadge(tech.position.enDeplacement)}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2"><Clock className="h-3 w-3" /><span>{format(new Date(tech.position.timestamp), "HH:mm", { locale: fr })}</span></div>
                        {tech.position.batterie && (
                          <div className="flex items-center gap-2"><Battery className={`h-3 w-3 ${batterieColor(tech.position.batterie)}`} /><span>{tech.position.batterie}%</span></div>
                        )}
                        {tech.position.vitesse && parseFloat(tech.position.vitesse) > 0 && (
                          <div className="flex items-center gap-2"><Car className="h-3 w-3" /><span>{t("kmh", { n: parseFloat(tech.position.vitesse).toFixed(0) })}</span></div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : techniciens.length > 0 ? (
                <div className="text-center py-4">
                  <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{t("aucunePosition")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("aucunePositionAstuce")}</p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{t("aucunTechnicien")}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">{t("statistiques")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{positions.filter((tt) => tt.position.enDeplacement).length}</p>
                  <p className="text-xs text-muted-foreground">{t("enDeplacement")}</p>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-primary">{positions.length}</p>
                  <p className="text-xs text-muted-foreground">{t("actifs")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">{t("legende")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>
                <span>{t("positionTechnicien")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm"><div className="w-3 h-3 rounded-full bg-green-500" /><span>{t("enDeplacement")}</span></div>
              <div className="flex items-center gap-2 text-sm"><div className="w-3 h-3 rounded-full bg-gray-400" /><span>{t("stationnaire")}</span></div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-[600px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />{t("carteTempsReel")}
                {positions.length > 0 && <Badge variant="outline" className="ml-2">{t("nbTechniciens", { n: positions.length })}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-60px)] p-0">
              <MapView className="w-full h-full rounded-b-lg" initialCenter={{ lat: 48.8566, lng: 2.3522 }} initialZoom={12} onMapReady={handleMapReady} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
