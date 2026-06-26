import type { RouterOutputs } from "@/shared/trpc";

/*
 * DOMAIN abonnement du SHELL : décisions PURES (bannière essai, blocage compte expiré). PORT FIDÈLE de
 * DashboardLayout/TrialBanner. Typé via RouterOutputs (0 any).
 */
export type Subscription = NonNullable<RouterOutputs["subscription"]["getCurrent"]>;
export type TrialSeverity = "critical" | "urgent" | "normal";

/** Sévérité de la bannière d'essai, ou null si non affichée (pas en essai / > 7 jours restants). PUR. */
export function trialBannerSeverity(sub: Subscription | null | undefined): TrialSeverity | null {
  if (!sub || sub.status !== "trialing" || sub.trialDaysLeft > 7) return null;
  if (sub.trialDaysLeft <= 1) return "critical";
  if (sub.trialDaysLeft <= 3) return "urgent";
  return "normal";
}

/*
 * Compte bloqué (essai fini / suspendu paiement / annulé / expiré) + routes tolérées (renouvellement/profil). PUR.
 * `past_due` = suspendu après épuisement du dunning (scheduler émet "Votre accès est suspendu").
 * `canceled` = toujours bloqué (le check `currentPeriodEnd < now` était cassé quand currentPeriodEnd est null).
 * `location` = chemin courant (ex. `/parametres`).
 */
export function accountBlockState(sub: Subscription | null | undefined, location: string): { isBlocked: boolean; blockerAllowed: boolean } {
  if (!sub) return { isBlocked: false, blockerAllowed: false };
  const trialEnded = sub.status === "trialing" && sub.trialDaysLeft <= 0;
  const isBlocked = !!(
    sub?.status === "expired" ||
    sub?.status === "past_due" ||
    sub?.status === "canceled" ||
    trialEnded
  );
  const p = location;
  const blockerAllowed = p.startsWith("/parametres") || p.startsWith("/profil");
  return { isBlocked, blockerAllowed };
}
