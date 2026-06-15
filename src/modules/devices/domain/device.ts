import { createHash } from "node:crypto";

// Appareil/session d'un utilisateur (parité legacy `devices`). Table HORS RLS, scopée par `user_id`.
export interface Device {
  readonly id: number;
  readonly deviceFingerprint: string;
  readonly deviceType: string;
  readonly browser: string | null;
  readonly os: string | null;
  readonly lastIp: string | null;
  readonly lastActiveAt: Date | null;
  readonly createdAt: Date | null;
}

// Détection device/browser/OS + fingerprint « grossier » (parité legacy `_core/deviceUtils`). PUR :
// basé sur OS+browser+type (pas l'IP qui change sur mobile, pas la version qui change à chaque MAJ) →
// regroupe « le même appareil même si l'IP change » pour la limite d'appareils (pas du tracking fin).
export function detectDeviceType(ua: string): "desktop" | "mobile" | "tablet" {
  if (!ua) return "desktop";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobile|iPhone|Android/i.test(ua)) {
    if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet"; // Android sans "Mobile" = tablette
    return "mobile";
  }
  return "desktop";
}

export function detectBrowser(ua: string): string {
  if (!ua) return "Unknown";
  // Ordre important : Edge contient "Chrome", Chrome contient "Safari".
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "Unknown";
}

export function detectOS(ua: string): string {
  if (!ua) return "Unknown";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

// Fingerprint : SHA-1 court (32 car.) de `OS|browser|deviceType`. Inclure le type distingue un même
// Chrome sur desktop vs mobile (tablette + PC). Parité legacy `generateFingerprint`.
export function generateFingerprint(ua: string): string {
  const os = detectOS(ua);
  const browser = detectBrowser(ua);
  const dt = detectDeviceType(ua);
  return createHash("sha1").update(`${os}|${browser}|${dt}`).digest("hex").slice(0, 32);
}
