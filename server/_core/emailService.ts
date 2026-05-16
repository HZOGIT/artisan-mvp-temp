import { Resend } from "resend";
import { ENV } from "./env";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  attachmentName?: string;
  attachmentContent?: string; // Base64 encoded
}

const resendConfigured = !!ENV.resendApiKey;

const resend = resendConfigured ? new Resend(ENV.resendApiKey) : null;

if (!resendConfigured) {
  console.warn("[Email] RESEND_API_KEY non configuré — les emails seront simulés (console.log)");
}

/**
 * Envoie un email via Resend API.
 * Fallback en mode simulation si Resend non configuré.
 */
export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; message: string }> {
  const { to, subject, body } = payload;

  if (!to || !subject || !body) {
    return { success: false, message: "Paramètres d'email manquants" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return { success: false, message: "Adresse email invalide" };
  }

  // Mode simulation si Resend non configuré
  if (!resend) {
    console.log(`[Email][SIM] → ${to} | ${subject}`);
    return { success: true, message: `Email simulé avec succès à ${to}` };
  }

  try {
    const emailOptions: Parameters<typeof resend.emails.send>[0] = {
      from: ENV.emailFrom || "Operioz <onboarding@resend.dev>",
      to,
      subject,
      html: body,
    };

    if (payload.attachmentName && payload.attachmentContent) {
      emailOptions.attachments = [
        {
          filename: payload.attachmentName,
          content: Buffer.from(payload.attachmentContent, "base64"),
        },
      ];
    }

    const { error } = await resend.emails.send(emailOptions);

    if (error) {
      console.error("[Email] Erreur Resend:", error);
      return { success: false, message: `Erreur lors de l'envoi: ${error.message}` };
    }

    console.log(`[Email] Envoyé à ${to} — ${subject}`);
    return { success: true, message: `Email envoyé avec succès à ${to}` };
  } catch (error) {
    console.error("[Email] Erreur:", error);
    return { success: false, message: "Erreur lors de l'envoi de l'email" };
  }
}

/**
 * Génère le contenu HTML d'un email pour un devis
 */
export function generateDevisEmailContent(params: {
  artisanName: string;
  clientName: string;
  devisNumero: string;
  devisObjet?: string;
  totalTTC: string;
  dateValidite?: string;
}): { subject: string; body: string } {
  const { artisanName, clientName, devisNumero, devisObjet, totalTTC, dateValidite } = params;

  const subject = `Devis ${devisNumero}${devisObjet ? ` - ${devisObjet}` : ''} de ${artisanName}`;

  const body = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background-color:#1e40af;padding:28px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${artisanName}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 16px 40px;">
            <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${clientName},</p>
            <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Veuillez trouver ci-joint le devis <strong>${devisNumero}</strong>${devisObjet ? ` concernant <em>&laquo;&nbsp;${devisObjet}&nbsp;&raquo;</em>` : ''}.</p>
          </td>
        </tr>

        <!-- Recap box -->
        <tr>
          <td style="padding:0 40px 28px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;width:45%;">Numéro du devis</td>
                      <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${devisNumero}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Montant TTC</td>
                      <td style="padding:6px 0;font-size:16px;color:#1e40af;font-weight:700;text-align:right;border-top:1px solid #dbeafe;">${totalTTC}</td>
                    </tr>
                    ${dateValidite ? `<tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Valable jusqu'au</td>
                      <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #dbeafe;">${dateValidite}</td>
                    </tr>` : ''}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA text -->
        <tr>
          <td style="padding:0 40px 36px 40px;">
            <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Pour accepter ce devis, vous pouvez nous contacter par retour d'email ou par téléphone.</p>
            <p style="margin:0 0 4px 0;font-size:15px;color:#374151;">Cordialement,</p>
            <p style="margin:0;font-size:15px;color:#111827;font-weight:600;">${artisanName}</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">Ce message a été envoyé automatiquement depuis Operioz</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, body };
}

/**
 * Génère le contenu HTML d'un email pour une facture
 */
export function generateFactureEmailContent(params: {
  artisanName: string;
  clientName: string;
  factureNumero: string;
  factureObjet?: string;
  totalTTC: string;
  dateEcheance?: string;
}): { subject: string; body: string } {
  const { artisanName, clientName, factureNumero, factureObjet, totalTTC, dateEcheance } = params;

  const subject = `Facture ${factureNumero}${factureObjet ? ` - ${factureObjet}` : ''} de ${artisanName}`;

  const body = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background-color:#1e40af;padding:28px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${artisanName}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 16px 40px;">
            <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${clientName},</p>
            <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Veuillez trouver ci-joint la facture <strong>${factureNumero}</strong>${factureObjet ? ` concernant <em>&laquo;&nbsp;${factureObjet}&nbsp;&raquo;</em>` : ''}.</p>
          </td>
        </tr>

        <!-- Recap box -->
        <tr>
          <td style="padding:0 40px 28px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;width:45%;">Numéro de facture</td>
                      <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${factureNumero}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Montant TTC</td>
                      <td style="padding:6px 0;font-size:16px;color:#1e40af;font-weight:700;text-align:right;border-top:1px solid #dbeafe;">${totalTTC}</td>
                    </tr>
                    ${dateEcheance ? `<tr>
                      <td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #dbeafe;">Date d'échéance</td>
                      <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-top:1px solid #dbeafe;">${dateEcheance}</td>
                    </tr>` : ''}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA text -->
        <tr>
          <td style="padding:0 40px 36px 40px;">
            <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Nous vous remercions de procéder au règlement dans les meilleurs délais.</p>
            <p style="margin:0 0 4px 0;font-size:15px;color:#374151;">Cordialement,</p>
            <p style="margin:0;font-size:15px;color:#111827;font-weight:600;">${artisanName}</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">Ce message a été envoyé automatiquement depuis Operioz</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, body };
}

/**
 * Génère le contenu d'un email de rappel pour facture impayée
 */
export function generateRappelFactureContent(params: {
  artisanName: string;
  clientName: string;
  factureNumero: string;
  totalTTC: string;
  joursRetard: number;
}): { subject: string; body: string } {
  const { artisanName, clientName, factureNumero, totalTTC, joursRetard } = params;

  const subject = `Rappel: Facture ${factureNumero} en attente de règlement`;

  const body = `
Bonjour ${clientName},

Nous nous permettons de vous rappeler que la facture ${factureNumero} d'un montant de ${totalTTC} est en attente de règlement depuis ${joursRetard} jour(s).

Nous vous serions reconnaissants de bien vouloir procéder au règlement dans les meilleurs délais.

Si vous avez déjà effectué le paiement, veuillez ignorer ce message.

Cordialement,
${artisanName}

---
Ce message a été envoyé automatiquement depuis Operioz.
  `.trim();

  return { subject, body };
}

/**
 * Génère le contenu d'un email de rappel pour intervention à venir
 */
export function generateRappelInterventionContent(params: {
  artisanName: string;
  clientName: string;
  interventionTitre: string;
  interventionDate: string;
  interventionAdresse?: string;
}): { subject: string; body: string } {
  const { artisanName, clientName, interventionTitre, interventionDate, interventionAdresse } = params;

  const subject = `Rappel: Intervention prévue demain - ${interventionTitre}`;

  const body = `
Bonjour ${clientName},

Nous vous rappelons que l'intervention "${interventionTitre}" est prévue pour demain, le ${interventionDate}.
${interventionAdresse ? `\nLieu: ${interventionAdresse}` : ''}

Si vous avez des questions ou souhaitez modifier ce rendez-vous, n'hésitez pas à nous contacter.

Cordialement,
${artisanName}

---
Ce message a été envoyé automatiquement depuis Operioz.
  `.trim();

  return { subject, body };
}

// ============================================================================
// T5 — Emails transactionnels subscription
// Templates HTML uniformes (header + CTA + footer) compatibles
// avec sendEmail() ci-dessus (champs to, subject, body).
// ============================================================================

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}

function baseTemplate(opts: {
  headerColor?: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
}): string {
  const headerColor = opts.headerColor || "#2563eb";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:${headerColor};padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escapeHtml(opts.title)}</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;color:#374151;font-size:15px;line-height:1.6;">
          ${opts.body}
          ${opts.ctaLabel && opts.ctaUrl ? `
          <p style="margin:24px 0;text-align:center;">
            <a href="${opts.ctaUrl}" style="display:inline-block;background:${headerColor};color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">${escapeHtml(opts.ctaLabel)} →</a>
          </p>` : ""}
          ${opts.footer ? `<p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;line-height:1.5;">${opts.footer}</p>` : ""}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">© ${new Date().getFullYear()} Operioz — Le logiciel de gestion tout-en-un pour les professionnels.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function buildTrialEndingJ3Email(params: {
  firstName?: string | null;
  stats?: { devis?: number; clients?: number; factures?: number };
  appUrl: string;
}): { subject: string; body: string } {
  const greet = params.firstName ? `Bonjour ${escapeHtml(params.firstName)},` : "Bonjour,";
  const stats = params.stats || {};
  const statsLine = (stats.devis || stats.clients || stats.factures)
    ? `<p style="margin:0 0 16px 0;">Pendant votre essai, vous avez deja cree <strong>${stats.devis || 0} devis</strong>, <strong>${stats.clients || 0} clients</strong> et <strong>${stats.factures || 0} factures</strong>. Continuez sur votre lancee !</p>`
    : "";
  return {
    subject: "⏰ Plus que 3 jours pour votre essai Operioz",
    body: baseTemplate({
      title: "Plus que 3 jours d'essai gratuit",
      body: `<p style="margin:0 0 16px 0;">${greet}</p>
        ${statsLine}
        <p style="margin:0 0 8px 0;">Choisissez votre plan pour continuer sans interruption :</p>
        <ul style="margin:0 0 16px 20px;padding:0;">
          <li><strong>Essentiel</strong> — 29€/mois — Artisan seul</li>
          <li><strong>Pro</strong> — 49€/mois — Equipe jusqu'a 3 users</li>
          <li><strong>Entreprise</strong> — 89€/mois — 10 users inclus</li>
        </ul>`,
      ctaLabel: "Choisir mon plan",
      ctaUrl: `${params.appUrl}/parametres?tab=abonnement`,
      footer: "Vos donnees sont conservees meme si vous decidez de ne pas continuer immediatement.",
    }),
  };
}

export function buildTrialEndingJ1Email(params: {
  firstName?: string | null;
  appUrl: string;
}): { subject: string; body: string } {
  const greet = params.firstName ? `Bonjour ${escapeHtml(params.firstName)},` : "Bonjour,";
  return {
    subject: "🚨 Dernier jour de votre essai Operioz",
    body: baseTemplate({
      headerColor: "#dc2626",
      title: "Dernier jour d'essai gratuit",
      body: `<p style="margin:0 0 16px 0;">${greet}</p>
        <p style="margin:0 0 16px 0;">Votre essai gratuit se termine <strong>demain</strong>. Choisissez votre plan maintenant pour ne pas perdre l'acces a vos donnees.</p>`,
      ctaLabel: "Choisir mon plan maintenant",
      ctaUrl: `${params.appUrl}/parametres?tab=abonnement`,
      footer: "Apres expiration, vos donnees restent conservees 30 jours.",
    }),
  };
}

export function buildPaymentConfirmedEmail(params: {
  planName: string;
  nextRenewalDate?: Date | null;
  appUrl: string;
}): { subject: string; body: string } {
  const renewalLine = params.nextRenewalDate
    ? `<p style="margin:0 0 16px 0;">Prochain renouvellement le <strong>${params.nextRenewalDate.toLocaleDateString("fr-FR")}</strong>.</p>`
    : "";
  return {
    subject: `Paiement confirme — Bienvenue sur Operioz ${escapeHtml(params.planName)}`,
    body: baseTemplate({
      headerColor: "#10b981",
      title: "Paiement confirme",
      body: `<p style="margin:0 0 16px 0;">Merci pour votre confiance ! Votre abonnement <strong>${escapeHtml(params.planName)}</strong> est actif.</p>
        ${renewalLine}`,
      ctaLabel: "Acceder a mon espace",
      ctaUrl: `${params.appUrl}/dashboard`,
    }),
  };
}

export function buildPaymentFailedEmail(params: { appUrl: string }): { subject: string; body: string } {
  return {
    subject: "⚠️ Probleme de paiement — Action requise",
    body: baseTemplate({
      headerColor: "#f59e0b",
      title: "Echec de paiement",
      body: `<p style="margin:0 0 16px 0;">Le paiement de votre abonnement Operioz n'a pas pu etre effectue. Merci de mettre a jour votre moyen de paiement <strong>sous 7 jours</strong> pour eviter la suspension.</p>`,
      ctaLabel: "Mettre a jour ma carte",
      ctaUrl: `${params.appUrl}/parametres?tab=abonnement`,
    }),
  };
}

/** Email decouverte J+3 apres inscription. */
export function buildDiscoveryJ3Email(params: {
  firstName?: string | null;
  appUrl: string;
}): { subject: string; body: string } {
  const greet = params.firstName ? `Bonjour ${escapeHtml(params.firstName)},` : "Bonjour,";
  return {
    subject: "Comment se passe votre decouverte d'Operioz ?",
    body: baseTemplate({
      title: "3 jours avec Operioz — ca se passe bien ?",
      body: `<p style="margin:0 0 16px 0;">${greet}</p>
        <p style="margin:0 0 16px 0;">Vous avez cree votre compte Operioz il y a 3 jours, et nous esperons que tout se passe bien pour vous.</p>
        <p style="margin:0 0 8px 0;"><strong>Voici 3 choses que vous pouvez faire des maintenant pour gagner du temps :</strong></p>
        <ul style="margin:0 0 16px 20px;padding:0;">
          <li><strong>Creer votre premier devis</strong> avec MonAssistant IA — une description vocale suffit.</li>
          <li><strong>Importer vos clients</strong> depuis Excel ou votre ancien logiciel (EBP, Sage, Ciel...).</li>
          <li><strong>Configurer le paiement en ligne</strong> pour vos factures — 0 frais d'installation.</li>
        </ul>
        <p style="margin:0 0 16px 0;">Une question ? Repondez simplement a cet email, notre equipe lit tout.</p>`,
      ctaLabel: "Acceder a mon espace",
      ctaUrl: `${params.appUrl}/dashboard`,
      footer: "Vous avez encore 27 jours d'essai gratuit. Sans engagement, sans carte bancaire.",
    }),
  };
}

export function buildSubscriptionCanceledEmail(params: {
  endsAt?: Date | null;
  appUrl: string;
}): { subject: string; body: string } {
  const dateLine = params.endsAt
    ? `<p style="margin:0 0 16px 0;">Vous avez encore acces jusqu'au <strong>${params.endsAt.toLocaleDateString("fr-FR")}</strong>.</p>`
    : "";
  return {
    subject: "Confirmation de resiliation Operioz",
    body: baseTemplate({
      title: "Votre abonnement est resilie",
      body: `<p style="margin:0 0 16px 0;">Votre abonnement Operioz a bien ete resilie comme demande.</p>
        ${dateLine}
        <p style="margin:0 0 16px 0;">Vos donnees sont conservees pendant 30 jours. Vous pouvez vous reabonner a tout moment.</p>`,
      ctaLabel: "Renouveler mon abonnement",
      ctaUrl: `${params.appUrl}/parametres?tab=abonnement`,
    }),
  };
}
