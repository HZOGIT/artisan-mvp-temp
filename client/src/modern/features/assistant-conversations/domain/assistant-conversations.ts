import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `assistant-conversations` (historique des fils MonAssistant). Type dérivé
// du routeur, calcul du « temps relatif » PUR et STRUCTURÉ (l'UI résout les libellés via i18n). 0 React/tRPC.

export type AiThread = RouterOutputs["assistant"]["getThreads"][number];

export type RelativeTime =
  | { kind: "instant" }
  | { kind: "min" | "h" | "j"; value: number }
  | { kind: "date"; iso: string };

// Temps écoulé depuis `date` sous forme structurée (i18n-friendly). PUR.
export function relativeTime(date: string | Date, now: number = Date.now()): RelativeTime {
  const d = new Date(date);
  const min = Math.floor((now - d.getTime()) / 60000);
  if (min < 1) return { kind: "instant" };
  if (min < 60) return { kind: "min", value: min };
  const h = Math.floor(min / 60);
  if (h < 24) return { kind: "h", value: h };
  const j = Math.floor(h / 24);
  if (j < 7) return { kind: "j", value: j };
  return { kind: "date", iso: d.toISOString() };
}
