/** URL du backend (vide = relatif, pour dev local avec proxy). Configurer VITE_BACKEND_URL en prod. */
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? ""
