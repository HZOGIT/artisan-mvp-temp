// Detection device/browser/OS et generation d'un fingerprint simple.
// Le fingerprint est volontairement grossier : il est base sur OS+browser
// (pas l'IP qui change sur mobile, pas la version qui change a chaque
// mise a jour). L'objectif est de regrouper "le meme appareil meme si
// l'IP change" pour la limite d'appareils, pas de faire du tracking
// pousse type FingerprintJS.

import { createHash } from "node:crypto";

export function detectDeviceType(ua: string): "desktop" | "mobile" | "tablet" {
  if (!ua) return "desktop";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobile|iPhone|Android/i.test(ua)) {
    // Android + "Mobile" = phone, Android sans Mobile = tablet
    if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";
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

// Fingerprint : SHA-1 court de OS+browser+deviceType, base sur le UA.
// Inclure deviceType permet de distinguer un meme Chrome utilise sur
// desktop vs mobile (cas d'usage realiste : tablette + PC).
export function generateFingerprint(ua: string): string {
  const os = detectOS(ua);
  const browser = detectBrowser(ua);
  const dt = detectDeviceType(ua);
  return createHash("sha1").update(`${os}|${browser}|${dt}`).digest("hex").slice(0, 32);
}
