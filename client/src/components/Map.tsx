/**
 * LEAFLET MAP COMPONENT (CDN-loaded, no npm packages)
 *
 * Uses Leaflet loaded globally from CDN via index.html.
 * No react-leaflet — direct Leaflet API with useRef/useEffect.
 *
 * USAGE:
 * const mapRef = useRef<L.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 48.8566, lng: 2.3522 }}
 *   initialZoom={12}
 *   onMapReady={(map) => { mapRef.current = map; }}
 * />
 */

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

// L is declared in leaflet.d.ts (loaded globally via CDN)

interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: L.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 48.8566, lng: 2.3522 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  const init = usePersistFn(() => {
    if (!mapContainer.current || typeof L === "undefined") return;
    if (mapInstance.current) return;

    mapInstance.current = L.map(mapContainer.current).setView(
      [initialCenter.lat, initialCenter.lng],
      initialZoom,
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    if (onMapReady) {
      onMapReady(mapInstance.current);
    }
  });

  useEffect(() => {
    init();
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [init]);

  return (
    <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />
  );
}
