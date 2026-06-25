import { eq } from "drizzle-orm";
import { clients as clientsTable, devis as devisTable, factures as facturesTable, facturesLignes as facturesLignesTable } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import { ClientRepositoryDrizzle } from "../../clients/infra/client-repository-drizzle";
import { DevisRepositoryDrizzle } from "../../devis/infra/devis-repository-drizzle";
import { FactureRepositoryDrizzle } from "../../factures/infra/facture-repository-drizzle";
import type { IImportErpRepository, ImportClientData, ImportDevisData, ImportFactureData } from "../application/import-erp-repository";
import type { ClientRef } from "../domain/import";

/*
 * Repository Drizzle de l'import ERP. Tables clients/devis/factures SOUS RLS → withTenant (artisanId).
 * La numérotation devis/facture réutilise les MÊMES générateurs serveur que la création normale
 * (compteurs `parametres_artisan` + MAX en base, anti-doublon) via les repos migrés ; la création
 * client réutilise le repo clients migré. Les insertions devis/facture sont « légères » (TTC brut, pas
 * de lignes/écritures — parité legacy : un import reprend des données, il n'émet rien).
 */
export class ImportErpRepositoryDrizzle implements IImportErpRepository {
  private readonly clientRepo: ClientRepositoryDrizzle;
  private readonly devisRepo: DevisRepositoryDrizzle;
  private readonly factureRepo: FactureRepositoryDrizzle;

  constructor(private readonly db: DbClient) {
    this.clientRepo = new ClientRepositoryDrizzle(db);
    this.devisRepo = new DevisRepositoryDrizzle(db);
    this.factureRepo = new FactureRepositoryDrizzle(db);
  }

  listClients(ctx: TenantContext): Promise<ClientRef[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: clientsTable.id, nom: clientsTable.nom, prenom: clientsTable.prenom, email: clientsTable.email })
        .from(clientsTable)
        .where(eq(clientsTable.artisanId, ctx.artisanId));
      return rows.map((r) => ({ id: r.id, nom: r.nom ?? null, prenom: r.prenom ?? null, email: r.email ?? null }));
    });
  }

  async createClient(ctx: TenantContext, data: ImportClientData): Promise<void> {
    await this.clientRepo.create(ctx, {
      nom: data.nom,
      prenom: data.prenom ?? null,
      email: data.email ?? null,
      telephone: data.telephone ?? null,
      adresse: data.adresse ?? null,
      codePostal: data.codePostal ?? null,
      ville: data.ville ?? null,
      notes: data.notes ?? null,
    });
  }

  async createDevisLight(ctx: TenantContext, data: ImportDevisData): Promise<void> {
    const numero = await this.devisRepo.nextNumero(ctx);
    await withTenant(this.db, ctx, async (tx) => {
      await tx.insert(devisTable).values({
        artisanId: ctx.artisanId,
        clientId: data.clientId,
        numero,
        objet: data.objet,
        /** valeur libre (parité legacy) ; un enum invalide lève → erreur de ligne */
        statut: data.statut as never,
        dateDevis: data.dateDevis,
        dateValidite: data.dateValidite,
        totalTTC: data.totalTTC,
        notes: data.notes ?? null,
      });
    });
  }

  async createFactureLight(ctx: TenantContext, data: ImportFactureData): Promise<void> {
    /*
     * Préserve le numéro LÉGAL d'origine s'il est fourni (facture historique d'un autre logiciel) ;
     * sinon génère un numéro serveur (parité création normale).
     */
    const numero = data.numero && data.numero.trim() ? data.numero.trim() : await this.factureRepo.nextNumero(ctx);
    await withTenant(this.db, ctx, async (tx) => {
      const [facture] = await tx.insert(facturesTable).values({
        artisanId: ctx.artisanId,
        clientId: data.clientId,
        numero,
        objet: data.objet,
        statut: data.statut as never,
        dateFacture: data.dateFacture,
        dateEcheance: data.dateEcheance,
        datePaiement: data.datePaiement ?? null,
        modePaiement: data.modePaiement ?? null,
        totalTTC: data.totalTTC,
      }).returning();
      if (data.lignes && data.lignes.length > 0) {
        for (const ligne of data.lignes) {
          const montantTTC = (parseFloat(ligne.montantHT) + parseFloat(ligne.montantTVA)).toFixed(2);
          await tx.insert(facturesLignesTable).values({
            factureId: facture.id,
            ordre: 0,
            designation: ligne.designation,
            description: null,
            quantite: ligne.quantite,
            unite: "unité",
            prixUnitaireHT: ligne.prixUnitaireHT,
            tauxTVA: ligne.tauxTVA,
            tvaCategorieId: ligne.tvaCategorieId ?? null,
            montantHT: ligne.montantHT,
            montantTVA: ligne.montantTVA,
            montantTTC,
            type: "produit",
          });
        }
      }
    });
  }

  listFactureNumeros(ctx: TenantContext): Promise<string[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx.select({ numero: facturesTable.numero }).from(facturesTable).where(eq(facturesTable.artisanId, ctx.artisanId));
      return rows.map((r) => r.numero);
    });
  }
}
