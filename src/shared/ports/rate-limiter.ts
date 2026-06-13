// Port de limitation de débit (anti-abus). Les use-cases en dépendent (interface),
// jamais d'une impl concrète. `check(key)` résout `true` si l'action est autorisée
// (quota restant), `false` si la limite est atteinte pour cette clé.
export interface RateLimiterPort {
  check(key: string): Promise<boolean>;
}

// Limiteur en mémoire à fenêtre glissante (défaut de production du nouveau stack).
// Conserve les horodatages récents par clé ; autorise tant que leur nombre dans la
// fenêtre reste < limite. Mono-instance (suffisant pour un envoi d'email anti-abus).
export class SlidingWindowRateLimiter implements RateLimiterPort {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limite = 5,
    private readonly fenetreMs = 10 * 60 * 1000,
    private readonly maintenant: () => number = () => Date.now(),
  ) {}

  async check(key: string): Promise<boolean> {
    const now = this.maintenant();
    const debut = now - this.fenetreMs;
    const recents = (this.hits.get(key) ?? []).filter((t) => t > debut);
    if (recents.length >= this.limite) {
      this.hits.set(key, recents);
      return false;
    }
    recents.push(now);
    this.hits.set(key, recents);
    return true;
  }
}
