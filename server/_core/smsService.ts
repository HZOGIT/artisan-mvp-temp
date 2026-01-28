import { ENV } from './env';

interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Service d'envoi de SMS via Twilio
 * 
 * Configuration requise:
 * - TWILIO_ACCOUNT_SID: Identifiant du compte Twilio
 * - TWILIO_AUTH_TOKEN: Token d'authentification Twilio
 * - TWILIO_PHONE_NUMBER: Numéro de téléphone Twilio (format E.164, ex: +33612345678)
 */

// Vérifier si Twilio est configuré
export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

/**
 * Envoie un SMS via Twilio
 * @param to Numéro de téléphone du destinataire (format E.164 ou français)
 * @param message Contenu du message SMS
 * @returns Résultat de l'envoi
 */
export async function sendSms(to: string, message: string): Promise<SmsResult> {
  // Normaliser le numéro de téléphone au format E.164
  const normalizedPhone = normalizePhoneNumber(to);
  
  // Vérifier la configuration Twilio
  if (!isTwilioConfigured()) {
    console.warn('[SMS] Twilio non configuré - Mode simulation');
    console.log(`[SMS] Simulation d'envoi à ${normalizedPhone}: ${message}`);
    return {
      success: true,
      messageId: `SIM_${Date.now()}`,
    };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER!;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: normalizedPhone,
          From: fromNumber,
          Body: message,
        }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      console.log(`[SMS] Message envoyé avec succès à ${normalizedPhone}, SID: ${data.sid}`);
      return {
        success: true,
        messageId: data.sid,
      };
    } else {
      console.error(`[SMS] Erreur Twilio: ${data.message || data.error_message}`);
      return {
        success: false,
        error: data.message || data.error_message || 'Erreur inconnue',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error(`[SMS] Erreur d'envoi: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Envoie un code de vérification par SMS
 * @param to Numéro de téléphone du destinataire
 * @param code Code de vérification à 6 chiffres
 * @returns Résultat de l'envoi
 */
export async function sendVerificationCode(to: string, code: string): Promise<SmsResult> {
  const message = `Votre code de vérification pour signer le devis est: ${code}. Ce code expire dans 10 minutes.`;
  return sendSms(to, message);
}

/**
 * Normalise un numéro de téléphone français au format E.164
 * @param phone Numéro de téléphone (différents formats acceptés)
 * @returns Numéro au format E.164 (+33...)
 */
export function normalizePhoneNumber(phone: string): string {
  // Supprimer tous les espaces, tirets et points
  let cleaned = phone.replace(/[\s\-\.]/g, '');
  
  // Si le numéro commence par 00, remplacer par +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  }
  
  // Si le numéro commence par 0 (format français), convertir en +33
  if (cleaned.startsWith('0') && !cleaned.startsWith('+')) {
    cleaned = '+33' + cleaned.substring(1);
  }
  
  // Si le numéro ne commence pas par +, ajouter +33 (France par défaut)
  if (!cleaned.startsWith('+')) {
    cleaned = '+33' + cleaned;
  }
  
  return cleaned;
}

/**
 * Valide le format d'un numéro de téléphone
 * @param phone Numéro de téléphone à valider
 * @returns true si le format est valide
 */
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // Format E.164: + suivi de 10 à 15 chiffres
  return /^\+[1-9]\d{9,14}$/.test(normalized);
}
