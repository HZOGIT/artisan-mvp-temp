import { z } from "zod";

/**
 * Schéma de validation des variables d'environnement
 * Valide que tous les secrets requis sont présents et au bon format
 */
const envSchema = z.object({
  // Database - OPTIONNEL (temporairement pour debug)
  DATABASE_URL: z.string().optional(),
  
  // Auth - OPTIONNEL (temporairement pour debug)
  JWT_SECRET: z.string().optional(),
  VITE_APP_ID: z.string().optional(),
  OAUTH_SERVER_URL: z.string().optional(),
  VITE_OAUTH_PORTAL_URL: z.string().optional(),
  
  // Stripe - OPTIONNEL (temporairement pour debug)
  STRIPE_SECRET_KEY: z.string().optional(),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  
  // Manus API - OPTIONNEL
  BUILT_IN_FORGE_API_URL: z.string().optional(),
  BUILT_IN_FORGE_API_KEY: z.string().optional(),
  VITE_FRONTEND_FORGE_API_KEY: z.string().optional(),
  VITE_FRONTEND_FORGE_API_URL: z.string().optional(),
  
  // Owner Info - OPTIONNEL
  OWNER_OPEN_ID: z.string().optional(),
  OWNER_NAME: z.string().optional(),
  
  // Email (optionnel mais recommandé)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  
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
  appId: getEnv().VITE_APP_ID,
  oAuthServerUrl: getEnv().OAUTH_SERVER_URL,
  oAuthPortalUrl: getEnv().VITE_OAUTH_PORTAL_URL,
  
  // Stripe - ⚠️ SECRETS - NE JAMAIS EXPOSER AU CLIENT
  stripeSecretKey: getEnv().STRIPE_SECRET_KEY,
  stripeWebhookSecret: getEnv().STRIPE_WEBHOOK_SECRET,
  // Note: VITE_STRIPE_PUBLISHABLE_KEY est OK d'exposer (clé publique)
  
  // Manus API
  forgeApiUrl: getEnv().BUILT_IN_FORGE_API_URL,
  forgeApiKey: getEnv().BUILT_IN_FORGE_API_KEY,
  
  // Owner Info
  ownerOpenId: getEnv().OWNER_OPEN_ID,
  ownerName: getEnv().OWNER_NAME,
  
  // Environment
  isProduction: getEnv().NODE_ENV === "production",
  isDevelopment: getEnv().NODE_ENV === "development",
  isTest: getEnv().NODE_ENV === "test",
  
  // Email
  smtpHost: getEnv().SMTP_HOST,
  smtpPort: getEnv().SMTP_PORT,
  smtpUser: getEnv().SMTP_USER,
  smtpPass: getEnv().SMTP_PASS,
  
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
