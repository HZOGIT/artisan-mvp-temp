/** URL du backend (vide = relatif, pour dev local avec proxy). Configurer VITE_BACKEND_URL en prod. */
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? ""

/**
 * Construit une URL absolue vers le backend pour les endpoints REST non-tRPC (PDF, exports comptables,
 * fonts, RGPD…). Front et backend sont sur DEUX domaines distincts : tout chemin `/api/*` doit passer
 * par ici. L'ancien proxy same-origin Cloudflare (`/api/*` servi sur le domaine front) est supprimé —
 * un chemin relatif `/api/*` taperait le domaine front et renverrait 405. En dev local (BACKEND_URL
 * vide) le résultat reste relatif, ce qui convient au proxy de dev.
 */
export function apiUrl(path: string): string {
  return `${BACKEND_URL}${path}`
}
