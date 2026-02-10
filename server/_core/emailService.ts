import nodemailer from "nodemailer";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  attachmentName?: string;
  attachmentContent?: string; // Base64 encoded
}

// Configuration SMTP depuis les variables d'environnement
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

// Vérifier si SMTP est configuré
function isSmtpConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

// Créer le transporteur Nodemailer
function createTransporter() {
  if (!isSmtpConfigured()) {
    console.warn("[Email] SMTP non configuré - les emails ne seront pas envoyés");
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true pour 465, false pour autres ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/**
 * Envoie un email via SMTP (Gmail ou autre)
 */
export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; message: string }> {
  const { to, subject, body } = payload;

  // Validation basique
  if (!to || !subject || !body) {
    return { success: false, message: "Paramètres d'email manquants" };
  }

  // Validation de l'email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return { success: false, message: "Adresse email invalide" };
  }

  // Log de l'envoi
  console.log(`[Email] Préparation de l'envoi à ${to}`);
  console.log(`[Email] Sujet: ${subject}`);
  console.log(`[Email] Corps: ${body.substring(0, 100)}...`);

  if (payload.attachmentName) {
    console.log(`[Email] Pièce jointe: ${payload.attachmentName}`);
  }

  // Créer le transporteur
  const transporter = createTransporter();

  if (!transporter) {
    console.log("[Email] Mode simulation (SMTP non configuré)");
    // Mode simulation si SMTP non configuré
    return { 
      success: true, 
      message: `Email simulé à ${to} (SMTP non configuré)` 
    };
  }

  try {
    // Préparer les options de l'email
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Artisan MVP" <${SMTP_FROM}>`,
      to: to,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, "<br>"), // Version HTML simple
    };

    // Ajouter la pièce jointe si présente
    if (payload.attachmentName && payload.attachmentContent) {
      mailOptions.attachments = [
        {
          filename: payload.attachmentName,
          content: payload.attachmentContent,
          encoding: "base64",
        },
      ];
    }

    // Envoyer l'email
    const info = await transporter.sendMail(mailOptions);

    console.log(`[Email] ✅ Email envoyé avec succès!`);
    console.log(`[Email] Message ID: ${info.messageId}`);
    console.log(`[Email] Réponse: ${info.response}`);

    return { 
      success: true, 
      message: `Email envoyé avec succès à ${to}` 
    };

  } catch (error: any) {
    console.error("[Email] ❌ Erreur lors de l'envoi:", error.message);
    console.error("[Email] Détails:", error);

    return { 
      success: false, 
      message: `Erreur lors de l'envoi: ${error.message}` 
    };
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
