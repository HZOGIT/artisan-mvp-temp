import type { TenantContext } from "../../../shared/tenant";

/*
 * Port du jeton de flux iCal du tenant (colonne `artisans.icalToken`, table d'identité hors RLS →
 * scope par `id = ctx.artisanId`).
 */
export interface IIcalFeedRepository {
  // Jeton iCal courant du tenant (null si jamais généré).
  getToken(ctx: TenantContext): Promise<string | null>;
  // Pose/remplace le jeton iCal du tenant.
  setToken(ctx: TenantContext, token: string): Promise<void>;
}

// Générateur de jeton injectable (déterministe en test). Doit produire un jeton non devinable.
export type TokenGenerator = () => string;
