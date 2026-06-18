import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `abonnement` (clean-archi) : port moderne d'`AbonnementSection` (legacy
// `@/lib/trpc`). Types dérivés du routeur new-stack (subscription/devices) + catalogue plans + helpers
// PURS (prix, temps relatif, tiers d'essai). Aucune dépendance React/tRPC.

export type Subscription = NonNullable<RouterOutputs["subscription"]["getCurrent"]>;
export type Device = RouterOutputs["devices"]["list"][number];
export type Plan = "essentiel" | "pro" | "entreprise";
export type BillingInterval = "month" | "year";

export interface PlanDef {
  readonly id: Plan;
  readonly name: string;
  readonly monthly: number;
  readonly yearly: number;
  readonly users: number;
  readonly description: string;
  readonly features: readonly string[];
  readonly extraUserMonth?: number;
  readonly highlight?: boolean;
}

// Catalogue tarifaire (données métier, parité legacy — l'annuel = 12 mois -20%).
export const PLANS: readonly PlanDef[] = [
  { id: "essentiel", name: "Essentiel", monthly: 29, yearly: 29 * 12 * 0.8, users: 1, description: "Pour artisan seul", features: ["1 utilisateur", "3 appareils max", "2 sessions simultanées", "Toutes les fonctionnalités"] },
  { id: "pro", name: "Pro", monthly: 49, yearly: 49 * 12 * 0.8, users: 3, description: "Petite équipe", features: ["3 utilisateurs inclus", "+10€/mois par user supplémentaire", "3 appareils par user", "3 sessions simultanées"], extraUserMonth: 10, highlight: true },
  { id: "entreprise", name: "Entreprise", monthly: 89, yearly: 89 * 12 * 0.8, users: 10, description: "Equipe constituee", features: ["10 utilisateurs inclus", "+8€/mois par user supplémentaire", "3 appareils par user", "4 sessions simultanées"], extraUserMonth: 8 },
];

// Prix d'un plan avec N users supplémentaires (parité legacy : extra annualisé -20%). PUR.
export function calcPrice(def: PlanDef, extra: number, interval: BillingInterval): number {
  const base = interval === "month" ? def.monthly : def.yearly;
  const extraCost = extra * (def.extraUserMonth || 0) * (interval === "month" ? 1 : 12 * 0.8);
  return base + extraCost;
}

// Plan « actuel » : même id ET abonnement encore valide (ni expiré ni résilié). PUR.
export function isCurrentPlan(sub: Subscription, p: Plan): boolean {
  return sub.plan === p && sub.status !== "expired" && sub.status !== "canceled";
}

// Tier de couleur de l'essai selon les jours restants (≤1 danger, ≤3 warning, sinon normal). PUR.
export function trialColorTier(daysLeft: number): "danger" | "warning" | "normal" {
  if (daysLeft <= 1) return "danger";
  if (daysLeft <= 3) return "warning";
  return "normal";
}

// % de progression de la barre d'essai (sur 30 j), borné 0-100. PUR.
export function trialProgressPct(daysLeft: number): number {
  return Math.max(0, Math.min(100, (daysLeft / 30) * 100));
}

// Temps relatif court (parité legacy) ; au-delà de 7 j → date absolue. PUR (date-fns).
export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "il y a quelques secondes";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return format(d, "dd MMM yyyy", { locale: fr });
}

// Libellé capitalisé d'un plan ("pro" → "Pro"). PUR.
export function planLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
