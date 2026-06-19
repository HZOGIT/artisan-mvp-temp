import { useEffect, useRef } from "react";

/*
 * Carte Leaflet (chargé via CDN global, cf. index.html — pas de package npm). Re-port de components/Map.
 * L est déclaré globalement (leaflet.d.ts). Sans dépendance legacy : init inline (remplace usePersistFn), cn → join.
 */
interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: L.Map) => void;
}
export function MapView({ className, initialCenter = { lat: 48.8566, lng: 2.3522 }, initialZoom = 12, onMapReady }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const onReadyRef = useRef(onMapReady);
  onReadyRef.current = onMapReady;

  useEffect(() => {
    if (!mapContainer.current || typeof L === "undefined" || mapInstance.current) return undefined;
    mapInstance.current = L.map(mapContainer.current).setView([initialCenter.lat, initialCenter.lng], initialZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(mapInstance.current);
    onReadyRef.current?.(mapInstance.current);
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, []);

  return <div ref={mapContainer} className={["w-full h-[500px]", className].filter(Boolean).join(" ")} />;
}
