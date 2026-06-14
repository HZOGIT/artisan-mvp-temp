import type { ITechnicienPositionReader } from "./application/position-reader";
import { createGeolocalisationRouter } from "./interface/trpc/geolocalisation.router";

// Wiring DI du module « geolocalisation » (positions des techniciens, lecture seule).
export interface GeolocalisationModuleDeps {
  readonly reader: ITechnicienPositionReader;
}

export interface GeolocalisationModule {
  readonly deps: GeolocalisationModuleDeps;
  readonly router: ReturnType<typeof createGeolocalisationRouter>;
}

export function createGeolocalisationModule(deps: GeolocalisationModuleDeps): GeolocalisationModule {
  return { deps, router: createGeolocalisationRouter(deps.reader) };
}
