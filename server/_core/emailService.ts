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
      from: ENV.emailFrom || "Artisan MVP <onboarding@resend.dev>",
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
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">Ce message a été envoyé automatiquement depuis MonArtisan Pro</p>
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
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">Ce message a été envoyé automatiquement depuis MonArtisan Pro</p>
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
Ce message a été envoyé automatiquement depuis Artisan MVP.
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
Ce message a été envoyé automatiquement depuis Artisan MVP.
  `.trim();

  return { subject, body };
}
