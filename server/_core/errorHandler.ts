import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

/**
 * Gestionnaire d'erreurs centralisé
 * Normalise les erreurs et évite d'exposer les détails en production
 */

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number = 500,
    message: string = "Erreur interne du serveur"
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Convertir une erreur en TRPCError approprié
 */
export function handleError(error: unknown): TRPCError {
  // Log l'erreur complète en développement
  if (ENV.isDevelopment) {
    console.error("[ERROR]", error);
  }

  // Erreur TRPC
  if (error instanceof TRPCError) {
    return error;
  }

  // Erreur applicative personnalisée
  if (error instanceof AppError) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: ENV.isProduction
        ? "Une erreur est survenue"
        : error.message,
    });
  }

  // Erreur de validation Zod
  if (error instanceof Error && error.name === "ZodError") {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: "Données invalides",
    });
  }

  // Erreur générique
  if (error instanceof Error) {
    // Ne pas exposer les détails en production
    if (ENV.isProduction) {
      console.error("[ERROR]", error.message);
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Une erreur est survenue",
      });
    }

    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }

  // Erreur inconnue
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: ENV.isProduction
      ? "Une erreur est survenue"
      : String(error),
  });
}

/**
 * Wrapper pour capturer les erreurs dans les procédures tRPC
 */
export function withErrorHandling<T>(
  fn: () => Promise<T>
): Promise<T> {
  return fn().catch((error) => {
    throw handleError(error);
  });
}

/**
 * Middleware tRPC pour la gestion d'erreurs globale
 */
export function errorHandlingMiddleware() {
  return async ({ next }: any) => {
    try {
      return await next();
    } catch (error) {
      throw handleError(error);
    }
  };
}

/**
 * Logger les erreurs avec contexte
 */
export function logError(
  error: unknown,
  context: {
    userId?: number;
    artisanId?: number;
    operation?: string;
    [key: string]: any;
  } = {}
): void {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  const logEntry = {
    timestamp,
    level: "ERROR",
    message: errorMessage,
    stack: errorStack,
    context,
  };

  // En production, envoyer à Sentry ou un service de logging
  if (ENV.isProduction && ENV.sentryDsn) {
    // TODO: Implémenter Sentry
    console.error(JSON.stringify(logEntry));
  } else {
    console.error(logEntry);
  }
}
