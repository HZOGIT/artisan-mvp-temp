// Flag d'activation du front neuf (`/v2`) — mécanisme de bascule strangler-fig, par utilisateur.
// Règle : `?v2=1` ACTIVE explicitement, `?v2=0` DÉSACTIVE explicitement (escape hatch / rollback), la
// valeur est mémorisée (localStorage) pour rester « collante » entre les navigations.
// **Bascule par défaut (OPE-403)** : toutes les pages étant migrées, l'absence de préférence vaut
// désormais ACTIVÉ. Seul un opt-out explicite (`?v2=0`, mémorisé `"0"`) force le legacy. Le legacy
// reste servi comme filet de secours tant qu'il n'est pas supprimé.

const STORAGE_KEY = "operioz:v2";
const PARAM = "v2";

// Résolution PURE de l'état effectif (testable sans DOM) : l'URL prime ; sinon, défaut ACTIVÉ sauf
// opt-out explicite mémorisé (`"0"`).
export function resolveV2Enabled(fromUrl: boolean | null, stored: string | null): boolean {
  if (fromUrl !== null) return fromUrl;
  return stored !== "0";
}

// Cœur PUR (testable sans DOM) : lit le flag depuis une query string.
// `1`/`true` → true · `0`/`false` → false · paramètre absent → null (= « pas d'avis, voir le storage »).
export function readV2FlagFromSearch(search: string): boolean | null {
  const raw = new URLSearchParams(search).get(PARAM);
  if (raw === null) return null;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function persist(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // storage indisponible (mode privé strict, quota) → on n'échoue pas : le flag vaut alors le défaut.
  }
}

function readPersistedRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage indisponible → défaut (activé)
  }
}

// Force l'état du flag (utilisé par un futur toggle UI).
export function setV2Enabled(on: boolean): void {
  persist(on);
}

// État effectif du flag : l'URL prime (et met à jour le storage), sinon défaut activé sauf opt-out.
export function isV2Enabled(search: string = window.location.search): boolean {
  const fromUrl = readV2FlagFromSearch(search);
  if (fromUrl !== null) persist(fromUrl);
  return resolveV2Enabled(fromUrl, readPersistedRaw());
}
