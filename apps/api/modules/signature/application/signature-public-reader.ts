import type { TenantContext } from "../../../shared/tenant";
import type { Signature } from "../domain/signature";

/*
 * ── Surface PUBLIQUE par token (portail de signature, sans cookie tenant) ────────────────────────
 * Résolution du token → signature + devis rattaché (lue via la policy RLS `public_token_select` sur
 * `devis`, `signatures_devis` étant HORS RLS). Renvoie l'`artisanId` pour basculer ensuite sous le
 * tenant résolu (`withTenant`) et lire les sous-ressources (client/artisan/lignes/options), comme le
 * portail d'avis. Le token EST la capacité ; token inconnu → `null`.
 */
export interface SignatureTokenResolution {
  readonly signature: Signature;
  readonly devisId: number;
  readonly artisanId: number;
  readonly dateVue: Date | null;
  readonly devisDateValidite: Date | null;
}

/*
 * Vue d'affichage du devis pour le portail public (parité legacy `getDevisForSignature`). Les rangs
 * sont renvoyés assez riches pour l'affichage + le PDF côté client (montants en `string` decimal).
 */
export interface SignatureDevisRow {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly numero: string;
  readonly objet: string | null;
  readonly statut: string;
  readonly dateValidite: Date | null;
  readonly dateVue: Date | null;
  readonly conditionsPaiement: string | null;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
  readonly createdAt: Date;
}

export interface SignatureArtisanRow {
  readonly id: number;
  readonly nomEntreprise: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly siret: string | null;
  readonly logo: string | null;
}

export interface SignatureClientRow {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
}

export interface SignatureLigneRow {
  readonly id: number;
  readonly designation: string;
  readonly description: string | null;
  readonly quantite: string;
  readonly unite: string | null;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly montantHT: string;
  readonly montantTVA: string;
  readonly montantTTC: string;
  readonly ordre: number;
  readonly tvaCategorieId?: string | null;
}

export interface SignatureOptionRow {
  readonly id: number;
  readonly nom: string;
  readonly description: string | null;
  readonly ordre: number;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
  readonly recommandee: boolean;
  readonly selectionnee: boolean;
  readonly lignes: readonly SignatureLigneRow[];
}

export interface SignatureDevisView {
  readonly devis: SignatureDevisRow;
  readonly artisan: SignatureArtisanRow | null;
  readonly client: SignatureClientRow | null;
  readonly lignes: readonly SignatureLigneRow[];
  readonly options: readonly SignatureOptionRow[];
}

export interface SignaturePublicReader {
  /** Résout le token (sous `withPublicToken`) → signature + devisId + artisanId, ou `null`. */
  resolveByToken(token: string): Promise<SignatureTokenResolution | null>;
  /** Lit la vue d'affichage du devis SOUS LE TENANT résolu (client/artisan/lignes/options). */
  getDevisView(ctx: TenantContext, devisId: number): Promise<SignatureDevisView | null>;
  /** Marque le devis comme vu (read-receipt) — best-effort, sous le tenant résolu. */
  markDevisVu(ctx: TenantContext, devisId: number): Promise<void>;
}
