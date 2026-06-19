import type { TenantContext } from "../tenant";

/*
 * Lectures « contact » partagées (émetteur artisan + destinataire client) nécessaires à l'envoi de
 * documents par email et à la génération de PDF. Ports réutilisables (clean-archi) : les use-cases
 * dépendent de ces interfaces, pas du schéma Drizzle ni d'un module métier. Les objets exposent les
 * champs typés utiles (email/nom…) + une signature d'index : la **ligne brute** est transmise telle
 * quelle au générateur PDF legacy (qui lit adresse/logo/TVA…), sans coupler le domaine à ces détails.
 * 
 * NB : factures (`modules/factures/application/contact-readers`) et commandes possèdent encore une
 * copie locale de ces ports — à consolider sur ce module partagé dans un firing de cleanup dédié.
 */

export interface ArtisanInfo {
  readonly id: number;
  readonly nomEntreprise: string | null;
  readonly email: string | null;
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
