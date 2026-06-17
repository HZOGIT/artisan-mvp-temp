import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `dashboard` (clean-archi) : types dérivés du routeur + logique PURE
// (état adaptatif, ordre/visibilité des widgets persistés en localStorage, formatage). Aucune
// dépendance React/tRPC. Les widgets eux-mêmes (`@/components/dashboard/**`) restent réutilisés tels
// quels (zéro-prop, auto-suffisants) — leur clean-archi widget-par-widget = slices futurs.

export type DashboardStats = RouterOutputs["dashboard"]["getStats"];
export type DashboardObjectifs = RouterOutputs["dashboard"]["getObjectifs"];
export type DashboardAlertData = RouterOutputs["dashboard"]["getAlerts"][number];
export type DashboardState = "nouveau" | "demarrage" | "confirme";

export const ORDER_KEY = "operioz.dashboard.widgetOrder";
export const HIDDEN_KEY = "operioz.dashboard.hiddenWidgets";

export const DEFAULT_ORDER = [
  "activitesAFaire",
  "tresoreriePrevisionnelle",
  "livraisonsEnRetard",
  "contratsAFacturer",
  "stockBas",
  "revenue",
  "devisRepartition",
  "topClients",
  "recentActivity",
  "upcomingInterventions",
  "objectifs",
] as const;

export function formatEUR(v: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

// État adaptatif (parité legacy) : nouveau (<3 clients ET <3 devis) · confirmé (>10 clients OU >10 devis) · démarrage sinon.
export function computeDashboardState(totalClients: number, totalDevis: number): DashboardState {
  if (totalClients < 3 && totalDevis < 3) return "nouveau";
  if (totalClients > 10 || totalDevis > 10) return "confirme";
  return "demarrage";
}

// Ordre des widgets depuis le JSON localStorage : garde les ids encore valides (dans l'ordre sauvé)
// puis ajoute en fin les nouveaux ids non sauvés. JSON invalide → ordre par défaut (`allIds`). PUR.
export function resolveWidgetOrder(rawJson: string | null, allIds: readonly string[]): string[] {
  if (!rawJson) return [...allIds];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [...allIds];
    const valid = parsed.filter((id: unknown): id is string => typeof id === "string" && allIds.includes(id));
    const missing = allIds.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return [...allIds];
  }
}

// Ids masqués depuis le JSON localStorage. JSON invalide → aucun masqué. PUR.
export function parseHidden(rawJson: string | null): string[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Ids visibles dans l'ordre : retire masqués + ids inconnus. PUR.
export function visibleWidgetIds(order: readonly string[], hidden: ReadonlySet<string>, allIds: readonly string[]): string[] {
  return order.filter((id) => !hidden.has(id) && allIds.includes(id));
}

// Prénom affichable depuis le nom complet ("Jean Dupont" → "Jean"), null si vide. PUR.
export function firstNameOf(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  return n.split(/\s+/)[0] || null;
}
