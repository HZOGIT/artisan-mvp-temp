import type { TenantContext } from "../../../shared/tenant";

/*
 * Lecture de l'artisan émetteur (tenant courant) pour l'en-tête email + le PDF bon de commande.
 * Champs typés utiles + signature d'index : la ligne brute `artisans` est transmise telle quelle au
 * générateur PDF legacy (qui lit d'autres champs : adresse, logo, TVA…), sans coupler le domaine.
 */
export interface ArtisanInfo {
  readonly id: number;
  readonly nomEntreprise: string | null;
  readonly email: string | null;
  readonly [key: string]: unknown;
}

/** Émetteur courant (déduit de `ctx.artisanId`). Renvoie null si absent. */
export interface ArtisanReader {
  getArtisan(ctx: TenantContext): Promise<ArtisanInfo | null>;
}
