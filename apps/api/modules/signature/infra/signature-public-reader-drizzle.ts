import { and, asc, eq } from "drizzle-orm";
import {
  artisans,
  clients,
  devis,
  devisLignes,
  devisOptions,
  devisOptionsLignes,
  signaturesDevis,
} from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withPublicToken, withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { SignatureStatut } from "../domain/signature";
import type {
  SignaturePublicReader,
  SignatureTokenResolution,
  SignatureDevisView,
  SignatureLigneRow,
} from "../application/signature-public-reader";

/*
 * Lecture PUBLIQUE par token (portail de signature, sans cookie tenant).
 * 1) `resolveByToken` : sous `withPublicToken`, lit la signature (`signatures_devis` HORS RLS) jointe
 *    au devis rattaché (policy `public_token_select` sur `devis`) → résout l'`artisanId`.
 * 2) `getDevisView` / `markDevisVu` : sous le tenant résolu (`withTenant`) — pas d'écriture/lecture
 *    tenant hors scope. Aucune fuite cross-tenant (le token ne donne accès qu'à SON devis).
 */
export class SignaturePublicReaderDrizzle implements SignaturePublicReader {
  constructor(private readonly db: DbClient) {}

  resolveByToken(token: string): Promise<SignatureTokenResolution | null> {
    return withPublicToken(this.db, token, async (tx) => {
      const [r] = await tx
        .select({
          sig: signaturesDevis,
          devisId: devis.id,
          artisanId: devis.artisanId,
          dateVue: devis.dateVue,
          devisDateValidite: devis.dateValidite,
          devisStatut: devis.statut,
        })
        .from(signaturesDevis)
        .innerJoin(devis, eq(devis.id, signaturesDevis.devisId))
        .where(eq(signaturesDevis.token, token))
        .limit(1);
      if (!r) return null;
      return {
        signature: {
          id: r.sig.id,
          devisId: r.sig.devisId,
          token: r.sig.token,
          statut: (r.sig.statut ?? "en_attente") as SignatureStatut,
          signatureData: r.sig.signatureData ?? null,
          signataireName: r.sig.signataireName ?? null,
          signataireEmail: r.sig.signataireEmail ?? null,
          ipAddress: r.sig.ipAddress ?? null,
          userAgent: r.sig.userAgent ?? null,
          motifRefus: r.sig.motifRefus ?? null,
          signedAt: r.sig.signedAt ?? null,
          expiresAt: r.sig.expiresAt,
          createdAt: r.sig.createdAt,
          documentHash: r.sig.documentHash ?? null,
          documentHashedAt: r.sig.documentHashedAt ?? null,
        },
        devisId: r.devisId,
        artisanId: r.artisanId,
        dateVue: r.dateVue ?? null,
        devisDateValidite: r.devisDateValidite ?? null,
        devisStatut: r.devisStatut ?? "brouillon",
      };
    });
  }

  getDevisView(ctx: TenantContext, devisId: number): Promise<SignatureDevisView | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [d] = await tx.select().from(devis).where(eq(devis.id, devisId)).limit(1);
      if (!d) return null;

      const [a] = await tx.select().from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
      const [c] = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, d.clientId), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);

      const lignesRows = await tx
        .select()
        .from(devisLignes)
        .where(eq(devisLignes.devisId, devisId))
        .orderBy(asc(devisLignes.ordre));

      const optionsRows = await tx
        .select()
        .from(devisOptions)
        .where(eq(devisOptions.devisId, devisId))
        .orderBy(asc(devisOptions.ordre));

      const options = await Promise.all(
        optionsRows.map(async (o) => {
          const optLignes = await tx
            .select()
            .from(devisOptionsLignes)
            .where(eq(devisOptionsLignes.optionId, o.id))
            .orderBy(asc(devisOptionsLignes.ordre));
          return {
            id: o.id,
            nom: o.nom,
            description: o.description ?? null,
            ordre: o.ordre ?? 0,
            totalHT: o.totalHT ?? "0.00",
            totalTVA: o.totalTVA ?? "0.00",
            totalTTC: o.totalTTC ?? "0.00",
            recommandee: o.recommandee ?? false,
            selectionnee: o.selectionnee ?? false,
            lignes: optLignes.map(
              (l): SignatureLigneRow => ({
                id: l.id,
                designation: l.designation,
                description: l.description ?? null,
                quantite: l.quantite ?? "1.00",
                unite: l.unite ?? null,
                prixUnitaireHT: l.prixUnitaireHT ?? "0.00",
                tauxTVA: l.tauxTVA ?? "20.00",
                montantHT: l.montantHT ?? "0.00",
                montantTVA: l.montantTVA ?? "0.00",
                montantTTC: l.montantTTC ?? "0.00",
                ordre: l.ordre ?? 0,
                tvaCategorieId: l.tvaCategorieId ?? null,
              }),
            ),
          };
        }),
      );

      return {
        devis: {
          id: d.id,
          artisanId: d.artisanId,
          clientId: d.clientId,
          numero: d.numero,
          objet: d.objet ?? null,
          statut: d.statut ?? "brouillon",
          dateValidite: d.dateValidite ?? null,
          dateVue: d.dateVue ?? null,
          conditionsPaiement: d.conditionsPaiement ?? null,
          totalHT: d.totalHT ?? "0.00",
          totalTVA: d.totalTVA ?? "0.00",
          totalTTC: d.totalTTC ?? "0.00",
          createdAt: d.createdAt,
        },
        artisan: a
          ? {
              id: a.id,
              nomEntreprise: a.nomEntreprise ?? null,
              email: a.email ?? null,
              telephone: a.telephone ?? null,
              adresse: a.adresse ?? null,
              codePostal: a.codePostal ?? null,
              ville: a.ville ?? null,
              siret: a.siret ?? null,
              logo: a.logo ?? null,
            }
          : null,
        client: c
          ? {
              id: c.id,
              nom: c.nom,
              prenom: c.prenom ?? null,
              email: c.email ?? null,
              telephone: c.telephone ?? null,
              adresse: c.adresse ?? null,
              codePostal: c.codePostal ?? null,
              ville: c.ville ?? null,
            }
          : null,
        lignes: lignesRows.map(
          (l): SignatureLigneRow => ({
            id: l.id,
            designation: l.designation,
            description: l.description ?? null,
            quantite: l.quantite ?? "1.00",
            unite: l.unite ?? null,
            prixUnitaireHT: l.prixUnitaireHT ?? "0.00",
            tauxTVA: l.tauxTVA ?? "20.00",
            montantHT: l.montantHT ?? "0.00",
            montantTVA: l.montantTVA ?? "0.00",
            montantTTC: l.montantTTC ?? "0.00",
            ordre: l.ordre ?? 0,
            tvaCategorieId: l.tvaCategorieId ?? null,
          }),
        ),
        options,
      };
    });
  }

  markDevisVu(ctx: TenantContext, devisId: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(devis)
        .set({ dateVue: new Date() })
        .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)));
    });
  }
}
