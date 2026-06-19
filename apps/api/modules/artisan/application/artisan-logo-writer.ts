/*
 * Écriture du logo de l'artisan (stocké en data-URL base64 dans `artisans.logo`). Route HORS-tRPC
 * `/api/upload-logo` (POST/DELETE). L'artisan est résolu depuis le cookie JWT (capacité = la session).
 */
export interface ArtisanLogoWriter {
  /** Définit (ou efface si null) le logo de l'artisan. `logo` = data-URL base64 ou null. */
  setLogo(artisanId: number, logo: string | null): Promise<void>;
}
