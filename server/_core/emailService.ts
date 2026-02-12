import nodemailer from "nodemailer";
import { ENV } from "./env";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  attachmentName?: string;
  attachmentContent?: string; // Base64 encoded
}

const smtpConfigured = !!(ENV.smtpHost && ENV.smtpUser && ENV.smtpPass);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: ENV.smtpHost,
      port: Number(ENV.smtpPort) || 587,
      secure: Number(ENV.smtpPort) === 465,
      auth: {
        user: ENV.smtpUser,
        pass: ENV.smtpPass,
      },
    })
  : null;

if (!smtpConfigured) {
  console.warn("[Email] SMTP non configuré — les emails seront simulés (console.log)");
}

/**
 * Envoie un email via SMTP (nodemailer).
 * Fallback en mode simulation si SMTP non configuré.
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

  // Mode simulation si SMTP non configuré
  if (!transporter) {
    console.log(`[Email][SIM] → ${to} | ${subject}`);
    return { success: true, message: `Email simulé avec succès à ${to}` };
  }

  try {
    const mailOptions: nodemailer.SendMailOptions = {
      from: ENV.smtpFrom || ENV.smtpUser,
      to,
      subject,
      html: body,
    };

    if (payload.attachmentName && payload.attachmentContent) {
      mailOptions.attachments = [
        {
          filename: payload.attachmentName,
          content: Buffer.from(payload.attachmentContent, "base64"),
        },
      ];
    }

    await transporter.sendMail(mailOptions);
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
}): { subject: string; body: string } {
  const { artisanName, clientName, devisNumero, devisObjet, totalTTC } = params;

  const subject = `Devis ${devisNumero}${devisObjet ? ` - ${devisObjet}` : ''} de ${artisanName}`;

  const body = `
Bonjour ${clientName},

Veuillez trouver ci-joint le devis ${devisNumero}${devisObjet ? ` concernant "${devisObjet}"` : ''}.

Montant total TTC: ${totalTTC}

Ce devis est valable 30 jours à compter de sa date d'émission.

Pour accepter ce devis, vous pouvez nous contacter par retour d'email ou par téléphone.

Cordialement,
${artisanName}

---
Ce message a été envoyé automatiquement depuis Artisan MVP.
  `.trim();

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

  const body = `
Bonjour ${clientName},

Veuillez trouver ci-joint la facture ${factureNumero}${factureObjet ? ` concernant "${factureObjet}"` : ''}.

Montant total TTC: ${totalTTC}
${dateEcheance ? `Date d'échéance: ${dateEcheance}` : ''}

Nous vous remercions de procéder au règlement dans les meilleurs délais.

Cordialement,
${artisanName}

---
Ce message a été envoyé automatiquement depuis Artisan MVP.
  `.trim();

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
