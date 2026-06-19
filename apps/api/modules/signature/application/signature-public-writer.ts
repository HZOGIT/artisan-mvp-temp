import type { TenantContext } from "../../../shared/tenant";
import type { Signature } from "../domain/signature";

/*
 * Effets d'ÉCRITURE de la surface publique (signature/refus/choix d'option), exécutés SOUS LE TENANT
 * résolu par le token (`withTenant(artisanId)`), en transaction. L'immutabilité post-signature est
 * garantie au niveau SQL : les transitions ne s'appliquent QUE si `statut='en_attente'` (anti-rejeu).
 */
export interface SignDevisInput {
  readonly token: string;
  readonly devisId: number;
  readonly signatureData: string;
  readonly signataireName: string;
  readonly signataireEmail: string;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface RefuseDevisInput {
  readonly token: string;
  readonly devisId: number;
  readonly motifRefus: string | null;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface SignaturePublicWriter {
  /*
   * signatures_devis → accepte (+ signataire/ip/ua/signedAt) ET devis → accepte, en une transaction,
   * UNIQUEMENT si la signature est encore `en_attente` (garde SQL = immutabilité/anti-rejeu).
   * Renvoie la signature mise à jour (re-lue).
   */
  signDevis(ctx: TenantContext, input: SignDevisInput): Promise<Signature>;
  /** signatures_devis → refuse (+ motif/ip/ua/signedAt) ET devis → refuse, même garde transactionnelle. */
  refuseDevis(ctx: TenantContext, input: RefuseDevisInput): Promise<Signature>;
  /** devisId propriétaire d'une option (sous le tenant), ou `null` si l'option n'existe pas. */
  getOptionDevisId(ctx: TenantContext, optionId: number): Promise<number | null>;
  /** Choisit l'option (une seule `selectionnee` par devis : reset les autres puis set celle-ci). */
  selectOption(ctx: TenantContext, devisId: number, optionId: number): Promise<void>;
}
