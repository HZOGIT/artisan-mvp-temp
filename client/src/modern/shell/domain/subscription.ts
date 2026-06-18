import type { RouterOutputs } from "@/modern/shared/trpc";

// DOMAIN abonnement du SHELL : décisions PURES (bannière essai, blocage compte expiré). PORT FIDÈLE de
// DashboardLayout/TrialBanner. Typé via RouterOutputs (0 any).
export type Subscription = NonNullable<RouterOutputs["subscription"]["getCurrent"]>;
export type TrialSeverity = "critical" | "urgent" | "normal";

// Sévérité de la bannière d'essai, ou null si non affichée (pas en essai / > 7 jours restants). PUR.
export function trialBannerSeverity(sub: Subscription | null | undefined): TrialSeverity | null {
  if (!sub || sub.status !== "trialing" || sub.trialDaysLeft > 7) return null;
  if (sub.trialDaysLeft <= 1) return "critical";
  if (sub.trialDaysLeft <= 3) return "urgent";
  return "normal";
}

// Compte bloqué (essai fini / expiré / annulé échu) + routes tolérées (renouvellement/profil). PUR.
// `location` peut être un chemin legacy (`/parametres`) ou /v2 (`/v2/parametres`) → on normalise le préfixe /v2.
export function accountBlockState(sub: Subscription | null | undefined, location: string): { isBlocked: boolean; blockerAllowed: boolean } {
  const trialEnded = sub?.status === "trialing" && sub.trialDaysLeft <= 0;
  const isBlocked = !!(
    sub?.status === "expired" ||
    (sub?.status === "canceled" && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date()) ||
    trialEnded
  );
  const p = location.replace(/^\/v2/, "");
  const blockerAllowed = p.startsWith("/parametres") || p.startsWith("/profil");
  return { isBlocked, blockerAllowed };
}
