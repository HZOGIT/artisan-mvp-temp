import type { TenantContext } from "../../../shared/tenant";

/*
 * Lectures « contact » nécessaires à l'envoi d'une facture par email et à la génération du PDF
 * (émetteur = artisan courant ; destinataire = client de la facture). Ports dédiés au module
 * factures (clean-archi) : le use-case dépend de ces interfaces, pas du schéma Drizzle ni des
 * modules clients/parametres. Les objets exposent les champs typés utiles (email/nom…) + une
 * signature d'index : la **ligne brute** est transmise telle quelle au générateur PDF legacy
 * (qui lit d'autres champs : adresse, logo, TVA…), sans coupler le domaine à ces détails.
 */

export interface ArtisanInfo {
  readonly id: number;
  readonly nomEntreprise: string | null;
  readonly email: string | null;
  readonly siret?: string | null;
  readonly delaiPaiementJours?: number | null;
  readonly delaiPaiementType?: string | null;
  readonly [key: string]: unknown;
}

/** Émetteur courant (déduit du `TenantContext` — `ctx.artisanId`). Renvoie null si absent. */
export interface ArtisanReader {
  getArtisan(ctx: TenantContext): Promise<ArtisanInfo | null>;
}

export interface ClientInfo {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly [key: string]: unknown;
}

/** Lecture d'un client du tenant (anti-IDOR : null si le client n'appartient pas au tenant). */
export interface ClientReader {
  getClient(ctx: TenantContext, clientId: number): Promise<ClientInfo | null>;
}
