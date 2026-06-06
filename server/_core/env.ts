import { z } from "zod";

/**
 * Schéma de validation des variables d'environnement
 * Valide que tous les secrets requis sont présents et au bon format
 */
const envSchema = z.object({
  // Database - OPTIONNEL (temporairement pour debug)
  DATABASE_URL: z.string().optional(),
  
  // Auth — JWT_SECRET requis (min 32 chars) pour signer les sessions
  JWT_SECRET: z.string().min(32, "JWT_SECRET doit faire au moins 32 caracteres"),

  // Stripe - OPTIONNEL (temporairement pour debug)
  STRIPE_SECRET_KEY: z.string().optional(),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Stripe Billing - IDs des prix d'abonnement (OPE-11). Optionnels : si
  // absents, le checkout renvoie PRECONDITION_FAILED au lieu de planter au
  // demarrage. A renseigner en staging/prod (cf. .env.staging).
  STRIPE_PRICE_ESSENTIEL_MONTH: z.string().optional(),
  STRIPE_PRICE_ESSENTIEL_YEAR: z.string().optional(),
  STRIPE_PRICE_PRO_MONTH: z.string().optional(),
  STRIPE_PRICE_PRO_YEAR: z.string().optional(),
  STRIPE_PRICE_ENTREPRISE_MONTH: z.string().optional(),
  STRIPE_PRICE_ENTREPRISE_YEAR: z.string().optional(),
  STRIPE_PRICE_EXTRA_USER_PRO_MONTH: z.string().optional(),
  STRIPE_PRICE_EXTRA_USER_PRO_YEAR: z.string().optional(),
  STRIPE_PRICE_EXTRA_USER_ENT_MONTH: z.string().optional(),
  STRIPE_PRICE_EXTRA_USER_ENT_YEAR: z.string().optional(),

  // Owner Info - OPTIONNEL
  OWNER_NAME: z.string().optional(),
  
  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  
  // SMS Twilio (optionnel)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  
  // S3 Storage (optionnel)
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  
  // Monitoring (optionnel)
  SENTRY_DSN: z.string().optional(),
  
  // Analytics (optionnel)
  VITE_ANALYTICS_ENDPOINT: z.string().optional(),
  VITE_ANALYTICS_WEBSITE_ID: z.string().optional(),
  
  // App Info (optionnel)
  VITE_APP_LOGO: z.string().optional(),
  VITE_APP_TITLE: z.string().optional(),
  
  // Environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().optional(),
}).passthrough(); // Permettre les variables d'environnement supplémentaires

type EnvType = z.infer<typeof envSchema>;

/**
 * Valider les variables d'environnement au démarrage
 * Lève une exception si des secrets critiques sont manquants
 */
function validateEnv(): EnvType {
  try {
    const env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = (error as any).errors || [];
      const missingVars = errors
        .map((e: any) => `${e.path?.join('.') || 'unknown'}: ${e.message}`)
        .join('\n');
      
      throw new Error(
        `❌ ERREUR DE CONFIGURATION\n\n` +
        `Variables d'environnement invalides :\n${missingVars}\n\n` +
        `Assurez-vous que tous les secrets requis sont configurés correctement.`
      );
    }
    throw error;
  }
}

// Valider les secrets au démarrage
let validatedEnv: EnvType | null = null;

export function getEnv(): EnvType {
  if (!validatedEnv) {
    validatedEnv = validateEnv();
  }
  return validatedEnv;
}

/**
 * Exporter les variables d'environnement validées
 * ⚠️ NE JAMAIS exposer les secrets au client
 */
// Exporter les variables d'environnement validées
export const ENV = {
  // Database
  databaseUrl: getEnv().DATABASE_URL,
  
  // Auth
  cookieSecret: getEnv().JWT_SECRET,

  // Stripe - ⚠️ SECRETS - NE JAMAIS EXPOSER AU CLIENT
  stripeSecretKey: getEnv().STRIPE_SECRET_KEY,
  stripeWebhookSecret: getEnv().STRIPE_WEBHOOK_SECRET,
  // Note: VITE_STRIPE_PUBLISHABLE_KEY est OK d'exposer (clé publique)

  // Owner Info
  ownerName: getEnv().OWNER_NAME,
  
  // Environment
  isProduction: getEnv().NODE_ENV === "production",
  isDevelopment: getEnv().NODE_ENV === "development",
  isTest: getEnv().NODE_ENV === "test",
  
  // Email (Resend)
  resendApiKey: getEnv().RESEND_API_KEY,
  emailFrom: getEnv().EMAIL_FROM,
  
  // SMS
  twilioAccountSid: getEnv().TWILIO_ACCOUNT_SID,
  twilioAuthToken: getEnv().TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: getEnv().TWILIO_PHONE_NUMBER,
  
  // S3
  s3Bucket: getEnv().S3_BUCKET,
  s3Region: getEnv().S3_REGION,
  s3AccessKey: getEnv().S3_ACCESS_KEY,
  s3SecretKey: getEnv().S3_SECRET_KEY,
  
  // Monitoring
  sentryDsn: getEnv().SENTRY_DSN,
};

/**
 * Valider que les secrets ne sont pas exposés au client
 * À appeler dans le contexte tRPC pour s'assurer que les secrets
 * ne sont pas envoyés au client
 */
export function validateSecretsNotExposed(data: any): void {
  const secretPatterns = [
    /sk_/,  // Stripe secret key
    /jwt_secret/i,
    /database_url/i,
    /stripe_secret/i,
    /twilio_auth/i,
    /s3_secret/i,
  ];
  
  const dataStr = JSON.stringify(data);
  for (const pattern of secretPatterns) {
    if (pattern.test(dataStr)) {
      console.error("❌ ALERTE SÉCURITÉ : Secret détecté dans la réponse client !");
      throw new Error("Tentative d'exposition de secret");
    }
  }
}
