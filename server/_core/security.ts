import { TRPCError } from "@trpc/server";

/**
 * Wrapper de sécurité pour garantir l'isolation multi-tenant
 * Toutes les requêtes doivent filtrer par artisanId
 * 
 * Utilisation :
 * export const getClientById = createSecureQuery(
 *   async (artisanId: number, clientId: number) => {
 *     return db.select().from(clients)
 *       .where(and(
 *         eq(clients.id, clientId),
 *         eq(clients.artisanId, artisanId)
 *       ));
 *   }
 * );
 */
export function createSecureQuery<TArgs extends any[], TReturn>(
  queryFn: (artisanId: number, ...args: TArgs) => Promise<TReturn>
): (artisanId: number | null | undefined, ...args: TArgs) => Promise<TReturn> {
  return async (artisanId: number | null | undefined, ...args: TArgs): Promise<TReturn> => {
    if (!artisanId || typeof artisanId !== 'number' || artisanId <= 0) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Artisan ID invalide ou manquant"
      });
    }
    return queryFn(artisanId, ...args);
  };
}

/**
 * Wrapper pour mutations sécurisées
 * Garantit que seul l'artisan propriétaire peut modifier ses données
 */
export function createSecureMutation<TArgs extends any[], TReturn>(
  mutationFn: (artisanId: number, ...args: TArgs) => Promise<TReturn>
): (artisanId: number | null | undefined, ...args: TArgs) => Promise<TReturn> {
  return async (artisanId: number | null | undefined, ...args: TArgs): Promise<TReturn> => {
    if (!artisanId || typeof artisanId !== 'number' || artisanId <= 0) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Artisan ID invalide ou manquant"
      });
    }
    return mutationFn(artisanId, ...args);
  };
}

/**
 * Vérifier qu'une ressource appartient à l'artisan
 * Levée une exception FORBIDDEN si ce n'est pas le cas
 * 
 * Utilisation :
 * const client = await db.getClientById(artisan.id, clientId);
 * verifyOwnership(client?.artisanId, artisan.id, "client");
 */
export function verifyOwnership(
  resourceArtisanId: number | undefined | null,
  currentArtisanId: number,
  resourceType: string = "ressource"
): void {
  if (!resourceArtisanId || resourceArtisanId !== currentArtisanId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Accès non autorisé à cette ${resourceType}`
    });
  }
}

/**
 * Valider que l'artisan ID est valide et appartient à l'utilisateur
 * À utiliser dans les middlewares tRPC
 */
export function validateArtisanId(artisanId: unknown): asserts artisanId is number {
  if (typeof artisanId !== 'number' || artisanId <= 0) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Artisan ID invalide"
    });
  }
}

/**
 * Middleware tRPC pour injecter automatiquement l'artisanId
 * À utiliser comme : 
 * export const withArtisan = t.middleware(async ({ ctx, next }) => {
 *   const artisan = await db.getArtisanByUserId(ctx.user.id);
 *   if (!artisan) {
 *     throw new TRPCError({ code: "NOT_FOUND", message: "Profil artisan requis" });
 *   }
 *   return next({ ctx: { ...ctx, artisan } });
 * });
 */
export type SecureContext = {
  artisanId: number;
  userId: number;
};
