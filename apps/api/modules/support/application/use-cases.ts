import { TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { EmailPort } from "../../../shared/ports/email";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";

// Formulaire de contact support : envoie un email à l'équipe Operioz (parité legacy `support.contact`).
// AUCUNE table : pur effet de bord email + anti-flood. Le destinataire (boîte support) est injecté.
export type SupportSujet = "technique" | "facturation" | "suggestion" | "autre";

export interface ContactSupportInput {
  readonly nom: string;
  readonly email: string;
  readonly sujet: SupportSujet;
  readonly message: string;
}

export interface SupportDeps {
  readonly email: EmailPort;
  readonly rateLimiter: RateLimiterPort;
  // Boîte support destinataire (ex. support@operioz.com) — injectée (env au wiring).
  readonly destinataire: string;
}

const SUJET_LABELS: Record<SupportSujet, string> = {
  technique: "Problème technique",
  facturation: "Question facturation",
  suggestion: "Suggestion",
  autre: "Autre",
};

// Échappe le HTML inséré dans le corps de l'email (anti-injection). Parité legacy `safeHtml`.
function safeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Envoie le message de support. Anti-flood : borne l'envoi par compte (parité legacy 5 / 15 min via
// le rate-limiter injecté) → TooManyRequestsError (mappé TOO_MANY_REQUESTS). Le sujet est un libellé
// fermé (enum). Le corps HTML est échappé. Renvoie `{ success: true }` (parité legacy).
export async function contacterSupport(deps: SupportDeps, ctx: TenantContext, input: ContactSupportInput): Promise<{ success: true }> {
  const autorise = await deps.rateLimiter.check(`support:${ctx.userId}`);
  if (!autorise) throw new TooManyRequestsError("Trop de messages envoyés. Réessayez dans quelques minutes.");

  const label = SUJET_LABELS[input.sujet] ?? input.sujet;
  const body = `<html><body style="font-family:Arial,sans-serif;color:#1f2937;">
        <h2 style="color:#2563eb;">Nouveau message support (${label})</h2>
        <table cellpadding="6" style="border-collapse:collapse;">
          <tr><td><strong>De :</strong></td><td>${safeHtml(input.nom)} &lt;${safeHtml(input.email)}&gt;</td></tr>
          <tr><td><strong>User ID :</strong></td><td>${ctx.userId} (artisanId ${ctx.artisanId ?? "—"})</td></tr>
          <tr><td><strong>Sujet :</strong></td><td>${label}</td></tr>
        </table>
        <div style="background:#f9fafb;border-left:3px solid #2563eb;padding:12px 16px;margin-top:16px;white-space:pre-wrap;">${safeHtml(input.message)}</div>
      </body></html>`;

  await deps.email.send({
    to: deps.destinataire,
    subject: `[Support Operioz] ${label} — ${input.nom}`,
    body,
  });
  return { success: true };
}
