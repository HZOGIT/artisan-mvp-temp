import { and, desc, eq, inArray } from "drizzle-orm";
import { devis, factures, interventions, contratsMaintenance, paiementsStripe } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IPortalDocsReader, PortalContrat, PortalDevis, PortalFacture, PortalIntervention } from "../application/portal-docs-reader";

// Lecteur Drizzle des documents du portail. Tables SOUS RLS (devis/factures/interventions/contrats/
// paiements) → lectures via `withTenant(artisanId)` + filtre explicite `clientId` (anti-IDOR). Renvoie
// uniquement des sous-ensembles client-safe (ex. contrats SANS `notes` internes).
export class PortalDocsReaderDrizzle implements IPortalDocsReader {
  constructor(private readonly db: DbClient) {}

  listDevis(ctx: TenantContext, clientId: number): Promise<PortalDevis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: devis.id, numero: devis.numero, objet: devis.objet, totalTTC: devis.totalTTC, statut: devis.statut, createdAt: devis.createdAt })
        .from(devis)
        .where(and(eq(devis.clientId, clientId), eq(devis.artisanId, ctx.artisanId)))
        .orderBy(desc(devis.createdAt));
      // `tokenSignature` n'existe pas sur la table devis (parité legacy : toujours null).
      return rows.map((d) => ({ id: d.id, numero: d.numero, objet: d.objet ?? null, totalTTC: d.totalTTC ?? null, statut: d.statut ?? null, dateCreation: d.createdAt, tokenSignature: null }));
    });
  }

  listFactures(ctx: TenantContext, clientId: number): Promise<PortalFacture[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: factures.id, numero: factures.numero, objet: factures.objet, totalTTC: factures.totalTTC, statut: factures.statut, createdAt: factures.createdAt, dateEcheance: factures.dateEcheance })
        .from(factures)
        .where(and(eq(factures.clientId, clientId), eq(factures.artisanId, ctx.artisanId)))
        .orderBy(desc(factures.createdAt));
      if (rows.length === 0) return [];
      // Lien de paiement « en attente » par facture (1 requête groupée, anti N+1).
      const pendings = await tx
        .select({ factureId: paiementsStripe.factureId, lienPaiement: paiementsStripe.lienPaiement })
        .from(paiementsStripe)
        .where(and(inArray(paiementsStripe.factureId, rows.map((f) => f.id)), eq(paiementsStripe.statut, "en_attente")));
      const lienByFacture = new Map<number, string | null>();
      for (const p of pendings) if (!lienByFacture.has(p.factureId)) lienByFacture.set(p.factureId, p.lienPaiement ?? null);
      return rows.map((f) => ({
        id: f.id, numero: f.numero, objet: f.objet ?? null, totalTTC: f.totalTTC ?? null, statut: f.statut ?? null,
        dateCreation: f.createdAt, dateEcheance: f.dateEcheance ?? null, lienPaiement: lienByFacture.get(f.id) ?? null,
      }));
    });
  }

  listInterventions(ctx: TenantContext, clientId: number): Promise<PortalIntervention[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: interventions.id, titre: interventions.titre, description: interventions.description, dateDebut: interventions.dateDebut, statut: interventions.statut, adresse: interventions.adresse })
        .from(interventions)
        .where(and(eq(interventions.clientId, clientId), eq(interventions.artisanId, ctx.artisanId)));
      return rows.map((i) => ({ id: i.id, titre: i.titre, description: i.description ?? null, dateIntervention: i.dateDebut, statut: i.statut ?? null, adresse: i.adresse ?? null }));
    });
  }

  listContrats(ctx: TenantContext, clientId: number): Promise<PortalContrat[]> {
    return withTenant(this.db, ctx, async (tx) => {
      // ⚠️ on EXCLUT `notes` (notes internes artisan) et autres champs non client-safe (parité legacy).
      const rows = await tx
        .select({
          id: contratsMaintenance.id, reference: contratsMaintenance.reference, titre: contratsMaintenance.titre, description: contratsMaintenance.description,
          type: contratsMaintenance.type, montantHT: contratsMaintenance.montantHT, tauxTVA: contratsMaintenance.tauxTVA, periodicite: contratsMaintenance.periodicite,
          dateDebut: contratsMaintenance.dateDebut, dateFin: contratsMaintenance.dateFin, reconduction: contratsMaintenance.reconduction,
          prochainPassage: contratsMaintenance.prochainPassage, conditionsParticulieres: contratsMaintenance.conditionsParticulieres, statut: contratsMaintenance.statut,
        })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.clientId, clientId), eq(contratsMaintenance.artisanId, ctx.artisanId)));
      return rows.map((c) => ({
        id: c.id, reference: c.reference, titre: c.titre, description: c.description ?? null, type: c.type ?? null, montantHT: c.montantHT ?? null, tauxTVA: c.tauxTVA ?? null,
        periodicite: c.periodicite ?? null, dateDebut: c.dateDebut, dateFin: c.dateFin ?? null, reconduction: c.reconduction ?? null,
        prochainPassage: c.prochainPassage ?? null, conditionsParticulieres: c.conditionsParticulieres ?? null, statut: c.statut ?? null,
      }));
    });
  }
}
