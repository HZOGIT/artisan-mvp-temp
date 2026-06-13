// Port de limitation de débit (anti-abus). Les use-cases en dépendent (interface),
// jamais d'une impl concrète. `check(key)` résout `true` si l'action est autorisée
// (quota restant), `false` si la limite est atteinte pour cette clé.
export interface RateLimiterPort {
  check(key: string): Promise<boolean>;
}
