// Flux iCal d'abonnement au calendrier des interventions. Le jeton (`icalToken`) vit sur l'artisan
// (table d'identité) ; le chemin public est servi hors tRPC (route `/api/calendar/:token.ics`).
export interface IcalFeed {
  readonly path: string;
}

// Chemin d'abonnement à partir du jeton (le front préfixe l'origine). Fonction PURE.
export function icalPath(token: string): string {
  return `/api/calendar/${token}.ics`;
}
