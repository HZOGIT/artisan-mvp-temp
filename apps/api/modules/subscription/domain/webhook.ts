/*
 * Logique PURE du webhook abonnement Stripe (parité legacy `webhookHandler`). Mapping plan→limites,
 * résolution plan/statut depuis l'évènement, construction des champs d'upsert. Aucun effet de bord.
 */

export interface PlanLimits {
  readonly maxUsers: number;
  readonly maxDevices: number;
  readonly maxSessions: number;
}

/** Limites par plan (parité legacy `PLAN_LIMITS`). */
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  trial: { maxUsers: 1, maxDevices: 3, maxSessions: 2 },
  essentiel: { maxUsers: 1, maxDevices: 3, maxSessions: 2 },
  pro: { maxUsers: 3, maxDevices: 3, maxSessions: 3 },
  entreprise: { maxUsers: 10, maxDevices: 3, maxSessions: 4 },
  expired: { maxUsers: 0, maxDevices: 0, maxSessions: 0 },
};

/** (plan, extraUsers) depuis le metadata Stripe, ou null si plan inconnu (parité legacy). */
export function planFromMetadata(metadata: Record<string, unknown> | undefined): { plan: string; extraUsers: number } | null {
  const raw = metadata?.plan;
  const plan = raw ? String(raw).toLowerCase() : null;
  if (!plan || !PLAN_LIMITS[plan]) return null;
  const extra = metadata?.extraUsers ? parseInt(String(metadata.extraUsers), 10) : 0;
  return { plan, extraUsers: Number.isFinite(extra) ? extra : 0 };
}

/** artisanId depuis le metadata Stripe (>0), sinon null (le fallback customerId est résolu par le repo). */
export function artisanIdFromMetadata(metadata: Record<string, unknown> | undefined): number | null {
  const raw = metadata?.artisanId;
  const n = raw ? parseInt(String(raw), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Statut interne depuis le statut Stripe (parité legacy). */
export function computeInternalStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "active";
  }
}

export interface SubscriptionUpsertFields {
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly stripePriceId: string | null;
  readonly plan: string;
  readonly status: string;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly maxUsers: number;
  readonly maxDevicesPerUser: number;
  readonly maxConcurrentSessions: number;
}

const epochToDate = (s: unknown): Date | null => (typeof s === "number" && s > 0 ? new Date(s * 1000) : null);

/** Construit les champs d'upsert depuis l'objet `subscription` Stripe (parité legacy `handleSubscriptionUpsert`). */
export function mapSubscriptionUpsert(sub: Record<string, unknown>): SubscriptionUpsertFields {
  const planInfo = planFromMetadata(sub.metadata as Record<string, unknown> | undefined) || { plan: "trial", extraUsers: 0 };
  const limits = PLAN_LIMITS[planInfo.plan] || PLAN_LIMITS.trial;
  const maxUsers = limits.maxUsers + (planInfo.extraUsers || 0);
  const stripeStatus = String((sub.status as string) || "active");
  const items = sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  return {
    stripeCustomerId: (sub.customer as string) ?? null,
    stripeSubscriptionId: (sub.id as string) ?? null,
    stripePriceId: items?.data?.[0]?.price?.id ?? null,
    plan: planInfo.plan,
    status: computeInternalStatus(stripeStatus),
    trialEndsAt: epochToDate(sub.trial_end),
    currentPeriodStart: epochToDate(sub.current_period_start),
    currentPeriodEnd: epochToDate(sub.current_period_end),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    maxUsers,
    maxDevicesPerUser: limits.maxDevices,
    maxConcurrentSessions: limits.maxSessions,
  };
}

/** Champs d'extinction (parité legacy `handleSubscriptionDeleted` : plan expired, canceled). */
export function deletedUpsertFields(): { plan: string; status: string; cancelAtPeriodEnd: boolean } {
  return { plan: "expired", status: "canceled", cancelAtPeriodEnd: false };
}

/** Échappement HTML minimal (parité legacy `escapeHtml` du webhook). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Gabarit HTML uniforme des emails abonnement (parité legacy `subscriptionEmail`). Fonction PURE. */
export function subscriptionEmail(input: { title: string; body: string; ctaLabel: string; ctaUrl: string }): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#2563eb;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escapeHtml(input.title)}</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(input.body)}</p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${input.ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">${escapeHtml(input.ctaLabel)} →</a>
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">© ${new Date().getFullYear()} Operioz</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
