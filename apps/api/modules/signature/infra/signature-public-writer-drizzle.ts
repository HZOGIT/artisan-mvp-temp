import { and, eq } from "drizzle-orm";
import { devis, devisOptions, signaturesDevis } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { Signature, SignatureStatut } from "../domain/signature";
import type {
  SignaturePublicWriter,
  SignDevisInput,
  RefuseDevisInput,
} from "../application/signature-public-writer";

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
 * Effets d'écriture de la surface publique, SOUS LE TENANT résolu par le token. L'immutabilité
 * post-signature est garantie par la garde SQL `statut='en_attente'` dans le WHERE (anti-rejeu :
 * une 2ᵉ tentative ne réécrit rien). devis + signatures_devis sont modifiés dans la MÊME transaction.
 */
export class SignaturePublicWriterDrizzle implements SignaturePublicWriter {
  constructor(private readonly db: DbClient) {}

  signDevis(ctx: TenantContext, input: SignDevisInput): Promise<Signature> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(signaturesDevis)
        .set({
          statut: "accepte",
          signatureData: input.signatureData,
          signataireName: input.signataireName,
          signataireEmail: input.signataireEmail,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          signedAt: new Date(),
          documentHash: input.documentHash,
          documentHashedAt: input.documentHashedAt,
        })
        .where(and(eq(signaturesDevis.token, input.token), eq(signaturesDevis.statut, "en_attente")));
      await tx
        .update(devis)
        .set({ statut: "accepte" })
        .where(and(eq(devis.id, input.devisId), eq(devis.artisanId, ctx.artisanId)));
      const [r] = await tx.select().from(signaturesDevis).where(eq(signaturesDevis.token, input.token)).limit(1);
      if (!r) throw new Error("Signature introuvable après signature");
      return toDomain(r);
    });
  }

  refuseDevis(ctx: TenantContext, input: RefuseDevisInput): Promise<Signature> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(signaturesDevis)
        .set({
          statut: "refuse",
          motifRefus: input.motifRefus,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          signedAt: new Date(),
        })
        .where(and(eq(signaturesDevis.token, input.token), eq(signaturesDevis.statut, "en_attente")));
      await tx
        .update(devis)
        .set({ statut: "refuse" })
        .where(and(eq(devis.id, input.devisId), eq(devis.artisanId, ctx.artisanId)));
      const [r] = await tx.select().from(signaturesDevis).where(eq(signaturesDevis.token, input.token)).limit(1);
      if (!r) throw new Error("Signature introuvable après refus");
      return toDomain(r);
    });
  }

  getOptionDevisId(ctx: TenantContext, optionId: number): Promise<number | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** `devis_options` n'a pas d'artisanId → on vérifie l'appartenance via le devis parent (RLS). */
      const [o] = await tx
        .select({ devisId: devisOptions.devisId })
        .from(devisOptions)
        .innerJoin(devis, eq(devis.id, devisOptions.devisId))
        .where(and(eq(devisOptions.id, optionId), eq(devis.artisanId, ctx.artisanId)))
        .limit(1);
      return o?.devisId ?? null;
    });
  }

  selectOption(ctx: TenantContext, devisId: number, optionId: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Une seule option `selectionnee` par devis : reset les autres puis set celle-ci. */
      await tx.update(devisOptions).set({ selectionnee: false }).where(eq(devisOptions.devisId, devisId));
      await tx
        .update(devisOptions)
        .set({ selectionnee: true, dateSelection: new Date() })
        .where(and(eq(devisOptions.id, optionId), eq(devisOptions.devisId, devisId)));
    });
  }

  withDb(db: DbClient): SignaturePublicWriterDrizzle {
    return new SignaturePublicWriterDrizzle(db);
  }
}
