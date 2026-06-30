import { eq } from "drizzle-orm";
import { signaturesDevis } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { Signature, NewSignature, SignatureStatut } from "../domain/signature";
import type { ISignatureRepository } from "../application/signature-repository";

/** Mappe une ligne `signatures_devis` vers le type de domaine (statut par défaut `en_attente`). */
function toDomain(r: typeof signaturesDevis.$inferSelect): Signature {
  return {
    id: r.id,
    devisId: r.devisId,
    token: r.token,
    statut: (r.statut ?? "en_attente") as SignatureStatut,
    signatureData: r.signatureData ?? null,
    signataireName: r.signataireName ?? null,
    signataireEmail: r.signataireEmail ?? null,
    ipAddress: r.ipAddress ?? null,
    userAgent: r.userAgent ?? null,
    motifRefus: r.motifRefus ?? null,
    signedAt: r.signedAt ?? null,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    documentHash: r.documentHash ?? null,
    documentHashedAt: r.documentHashedAt ?? null,
  };
}

/*
 * Persistance `signatures_devis` (HORS RLS — pas d'artisanId). L'anti-IDOR est garanti EN AMONT par
 * le use-case (lecture RLS du devis parent). Aucune écriture tenant non scopée ici.
 */
export class SignatureRepositoryDrizzle implements ISignatureRepository {
  constructor(private readonly db: DbClient) {}

  async getByDevisId(devisId: number): Promise<Signature | null> {
    const [r] = await this.db.select().from(signaturesDevis).where(eq(signaturesDevis.devisId, devisId)).limit(1);
    return r ? toDomain(r) : null;
  }

  async getByToken(token: string): Promise<Signature | null> {
    const [r] = await this.db.select().from(signaturesDevis).where(eq(signaturesDevis.token, token)).limit(1);
    return r ? toDomain(r) : null;
  }

  async create(data: NewSignature): Promise<Signature> {
    await this.db.insert(signaturesDevis).values({ artisanId: data.artisanId, devisId: data.devisId, token: data.token, expiresAt: data.expiresAt });
    const created = await this.getByToken(data.token);
    if (!created) throw new Error("Création de la signature échouée");
    return created;
  }
}
