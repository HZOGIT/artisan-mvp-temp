// Flag d'activation du front neuf (`/v2`) — mécanisme de bascule strangler-fig opt-in, par utilisateur.
// Règle : `?v2=1` dans l'URL ACTIVE (et `?v2=0` DÉSACTIVE), la valeur est mémorisée (localStorage) pour
// rester « collante » entre les navigations. Sans paramètre d'URL, on relit la préférence mémorisée.
// Par défaut (rien en URL, rien en storage) → désactivé → comportement legacy STRICTEMENT inchangé.

const STORAGE_KEY = "operioz:v2";
const PARAM = "v2";

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

function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Force l'état du flag (utilisé par un futur toggle UI).
export function setV2Enabled(on: boolean): void {
  persist(on);
}

// État effectif du flag : l'URL prime (et met à jour le storage), sinon préférence mémorisée.
export function isV2Enabled(search: string = window.location.search): boolean {
  const fromUrl = readV2FlagFromSearch(search);
  if (fromUrl !== null) {
    persist(fromUrl);
    return fromUrl;
  }
  return readPersisted();
}
