import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAINE de la feature `notifications` (clean-archi) : types dérivés des sorties du routeur
// tRPC + règles PURES testables sans réseau ni i18n.

export type Notification = RouterOutputs["notifications"]["list"][number];
export type NotifFilter = "toutes" | "nonlues";

// Descripteur PUR de date relative (l'UI choisit la clé i18n / le format de repli). `now` injectable
// pour des tests déterministes. Reproduit exactement les seuils du legacy.
export type RelativeDate =
  | { kind: "instant" }
  | { kind: "minutes"; n: number }
  | { kind: "hours"; n: number }
  | { kind: "yesterday" }
  | { kind: "days"; n: number }
  | { kind: "date"; value: Date };

export function relativeDateDescriptor(date: string | Date, now: Date = new Date()): RelativeDate {
  const d = new Date(date);
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return { kind: "instant" };
  if (diffMin < 60) return { kind: "minutes", n: diffMin };
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return { kind: "hours", n: diffH };
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return { kind: "yesterday" };
  if (diffD < 7) return { kind: "days", n: diffD };
  return { kind: "date", value: d };
}
