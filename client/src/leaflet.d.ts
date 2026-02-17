/** Minimal Leaflet type declarations for CDN-loaded Leaflet */

declare namespace L {
  type LatLngExpression = [number, number] | { lat: number; lng: number };

  interface MapOptions {
    center?: LatLngExpression;
    zoom?: number;
  }

  interface Map {
    setView(center: LatLngExpression, zoom: number): Map;
    setZoom(zoom: number): Map;
    fitBounds(bounds: LatLngBounds, options?: { padding?: [number, number] }): Map;
    remove(): void;
  }

  interface LatLngBounds {
    getCenter(): LatLngExpression;
  }

  interface TileLayerOptions {
    attribution?: string;
    maxZoom?: number;
  }

  interface DivIconOptions {
    className?: string;
    html?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  }

  interface MarkerOptions {
    icon?: Icon | DivIcon;
    title?: string;
  }

  interface Icon {}
  interface DivIcon {}

  interface Marker {
    addTo(map: Map): Marker;
    remove(): void;
    setLatLng(latlng: LatLngExpression): Marker;
    setIcon(icon: Icon | DivIcon): Marker;
    bindPopup(content: string): Marker;
    setPopupContent(content: string): Marker;
    openPopup(): Marker;
    on(event: string, fn: (...args: any[]) => void): Marker;
  }

  function map(element: HTMLElement, options?: MapOptions): Map;
  function tileLayer(url: string, options?: TileLayerOptions): { addTo(map: Map): void };
  function marker(latlng: LatLngExpression, options?: MarkerOptions): Marker;
  function divIcon(options: DivIconOptions): DivIcon;
  function latLngBounds(latlngs: LatLngExpression[]): LatLngBounds;
}
