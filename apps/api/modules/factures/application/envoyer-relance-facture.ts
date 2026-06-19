import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { EmailPort } from "../../../shared/ports/email";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader, ClientReader } from "./contact-readers";
import type { IFactureRepository } from "./facture-repository";

/*
 * Relance d'une facture impayée par email (parité fonctionnelle du legacy `execEnvoyerRelance`) :
 * rappel + jours de retard, **sans PDF**, **sans changement de statut**. Tout est injecté (interfaces)
 * → testable sans infra. Porté dans le new-stack (le legacy `server/` est voué à la suppression).
 */

export interface RelanceMailingDeps {
  readonly artisanReader: ArtisanReader;
  readonly clientReader: ClientReader;
  readonly email: EmailPort;
  readonly rateLimiter: RateLimiterPort;
}

export interface EnvoyerRelanceInput {
  readonly factureId: number;
  readonly customMessage?: string;
}

export interface RelanceResult {
  readonly success: boolean;
  readonly message: string;
}

/** Même limiteur que l'envoi de facture (anti-abus d'envoi), clé dédiée relance par artisan. */
function rateLimitKey(artisanId: number): string {
  return `relance:${artisanId}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * Sujet + corps HTML du rappel (pur, testable) — parité du template legacy `buildRelanceEmailBody`
 * (en-tête rouge, n° facture, montant TTC, jours de retard). `customMessage` éventuel ajouté (échappé).
 */
export function buildRelanceEmail(params: {
  artisanName: string;
  clientName: string;
  factureNumero: string;
  totalTTC: string;
  joursRetard: number;
  customMessage?: string | null;
}): { subject: string; body: string } {
  const { factureNumero, totalTTC, joursRetard } = params;
  const artisanName = escapeHtml(params.artisanName);
  const clientName = escapeHtml(params.clientName);
  const subject = `Rappel : facture ${factureNumero} en attente de règlement`;
  const note = params.customMessage
    ? `<tr><td colspan="2" style="padding:16px 0 0 0;font-size:14px;color:#6b7280;font-style:italic;border-top:1px solid #e5e7eb;">${escapeHtml(params.customMessage)}</td></tr>`
    : "";
  const body = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#dc2626;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${artisanName}</h1>
        </td></tr>
        <tr><td style="padding:36px 40px 16px 40px;">
          <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${clientName},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Veuillez trouver ci-joint un rappel concernant la facture <strong>${factureNumero}</strong> d'un montant de <strong>${totalTTC}</strong>, en attente de règlement depuis ${joursRetard} jour(s).</p>
        </td></tr>
        <tr><td style="padding:0 40px 28px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
            <tr><td style="padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;width:45%;">Numéro de facture</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${factureNumero}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #fecaca;">Montant TTC</td><td style="padding:6px 0;font-size:16px;color:#dc2626;font-weight:700;text-align:right;border-top:1px solid #fecaca;">${totalTTC}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #fecaca;">Jours de retard</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #fecaca;">${joursRetard}</td></tr>
                ${note}
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px 36px 40px;">
          <p style="margin:0 0 14px 0;font-size:15px;color:#374151;line-height:1.6;">Nous vous serions reconnaissants de bien vouloir procéder au règlement dans les meilleurs délais.</p>
          <p style="margin:0 0 4px 0;font-size:15px;color:#374151;">Cordialement,</p>
          <p style="margin:0;font-size:15px;color:#111827;font-weight:600;">${artisanName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, body };
}

/** Jours de retard depuis l'échéance (0 si pas d'échéance ou non échue). */
export function joursDeRetard(dateEcheance: Date | null | undefined, now: number): number {
  if (!dateEcheance) return 0;
  return Math.max(0, Math.floor((now - new Date(dateEcheance).getTime()) / 86400000));
}

/*
 * Envoie une relance pour une facture impayée : ownership 404, email client requis 400, rate-limit
 * 429 ; email rappel SANS PDF ; **aucun changement de statut** (parité legacy).
 */
export async function envoyerRelanceFacture(
  repo: IFactureRepository,
  deps: RelanceMailingDeps,
  ctx: TenantContext,
  input: EnvoyerRelanceInput,
): Promise<RelanceResult> {
  const facture = await repo.getById(ctx, input.factureId);
  if (!facture) throw new NotFoundError("Facture introuvable");

  const artisan = await deps.artisanReader.getArtisan(ctx);
  if (!artisan) throw new NotFoundError("Artisan introuvable");

  const client = await deps.clientReader.getClient(ctx, facture.clientId);
  if (!client || !client.email) throw new ValidationError("Le client n'a pas d'adresse email");

  if (!(await deps.rateLimiter.check(rateLimitKey(ctx.artisanId)))) {
    throw new TooManyRequestsError("Trop de relances envoyées. Réessayez dans quelques minutes.");
  }

  const artisanName = artisan.nomEntreprise || "Votre artisan";
  const clientName = client.prenom ? `${client.prenom} ${client.nom}` : client.nom;
  const totalTTC = `${(parseFloat(facture.totalTTC || "0") || 0).toFixed(2)} €`;
  const joursRetard = joursDeRetard(facture.dateEcheance, Date.now());

  const { subject, body } = buildRelanceEmail({
    artisanName,
    clientName,
    factureNumero: facture.numero,
    totalTTC,
    joursRetard,
    customMessage: input.customMessage ?? null,
  });

  await deps.email.send({ to: client.email, subject, body });

  return { success: true, message: `Relance envoyée à ${client.email} — facture ${facture.numero}, ${joursRetard} j de retard` };
}
