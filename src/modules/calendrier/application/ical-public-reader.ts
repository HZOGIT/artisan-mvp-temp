import type { IcalEvent } from "../domain/ical";

// Flux iCal résolu par jeton public (`icalToken` sur l'artisan). Le jeton EST la capacité (pas de
// cookie tenant). `null` si le jeton est inconnu → 404 uniforme (anti-énumération).
export interface IcalFeedData {
  readonly calName: string;
  readonly events: IcalEvent[];
}

export interface IcalPublicReader {
  // Résout l'artisan par son `icalToken` puis charge ses interventions depuis `since`. `null` si jeton inconnu.
  getFeedByToken(token: string, since: Date): Promise<IcalFeedData | null>;
}
