/** Port d'écriture de l'état Connect d'un artisan (lookup cross-tenant via owner pool). */
export interface ConnectArtisanWriter {
  /** Upsert statut depuis un event `account.updated`. */
  upsertConnectStatus(accountId: string, obj: Record<string, unknown>): Promise<void>;
  /** Reset sur `deauthorized` depuis un event `account.application.deauthorized`. */
  resetConnectStatus(accountId: string): Promise<void>;
}
