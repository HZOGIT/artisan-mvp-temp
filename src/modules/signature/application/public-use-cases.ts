import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { Signature } from "../domain/signature";
import type { SignaturePublicReader, SignatureDevisView } from "./signature-public-reader";

// Dépendances de la surface PUBLIQUE par token (portail de signature).
export interface SignaturePublicDeps {
  readonly reader: SignaturePublicReader;
  readonly maintenant?: () => Date;
}

export interface DevisForSignature extends SignatureDevisView {
  readonly signature: Signature;
}

// `signature.getDevisForSignature` (parité legacy, PUBLIC par token) : affiche le devis à signer.
// - token inconnu → 404 (anti-oracle : message uniforme « invalide ou expiré »).
// - **lien expiré ET toujours en_attente → 400** (un devis déjà signé/refusé reste consultable).
// - read-receipt `markDevisVu` best-effort (1ʳᵉ consultation), n'altère jamais la réponse.
// Les sous-ressources (client/artisan/lignes/options) sont lues SOUS LE TENANT résolu via le token.
export async function getDevisForSignature(
  deps: SignaturePublicDeps,
  token: string,
): Promise<DevisForSignature> {
  const resolution = await deps.reader.resolveByToken(token);
  if (!resolution) throw new NotFoundError("Lien de signature invalide ou expiré");

  const now = (deps.maintenant ?? (() => new Date()))();
  if (now > resolution.signature.expiresAt && resolution.signature.statut === "en_attente") {
    throw new ValidationError("Ce lien de signature a expiré");
  }

  const ctx: TenantContext = { artisanId: resolution.artisanId, userId: 0 };

  // Read-receipt : marque le devis « vu » à la 1ʳᵉ consultation (idempotent + best-effort).
  if (!resolution.dateVue) {
    try {
      await deps.reader.markDevisVu(ctx, resolution.devisId);
    } catch {
      /* best-effort : ne casse jamais l'affichage */
    }
  }

  const view = await deps.reader.getDevisView(ctx, resolution.devisId);
  if (!view) throw new NotFoundError("Devis non trouvé");

  return { ...view, signature: resolution.signature };
}
