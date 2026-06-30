import { signaturesDevis } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { generateSignatureToken, computeSignatureExpiry } from "../../signature/domain/signature";
import type { DevisSignatureCreator } from "../application/envoyer-devis-email";

/**
 * Crée un token de signature dans `signatures_devis` (HORS RLS). L'anti-IDOR est garanti
 * EN AMONT par le use-case (le devis a été chargé sous RLS avant d'appeler ce creator).
 */
export class DevisSignatureCreatorDrizzle implements DevisSignatureCreator {
  constructor(private readonly db: DbClient) {}

  async create(devisId: number): Promise<{ token: string }> {
    const token = generateSignatureToken();
    await this.db.insert(signaturesDevis).values({ devisId, token, expiresAt: computeSignatureExpiry(new Date()) });
    return { token };
  }
}
