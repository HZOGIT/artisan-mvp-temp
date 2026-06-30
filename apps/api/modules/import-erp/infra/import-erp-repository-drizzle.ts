import { eq } from "drizzle-orm";
import { clients as clientsTable, devis as devisTable, factures as facturesTable, facturesLignes as facturesLignesTable } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import { round2 } from "../../../shared/money";
import { ValidationError } from "../../../shared/errors";
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
    const ttcNum = parseFloat(data.totalTTC || "0");
    /* ponytail: 20% TVA par défaut — le mapping import devis n'expose pas tauxTVA */
    const totalHT = round2(ttcNum / 1.2).toFixed(2);
    const totalTVA = round2(ttcNum - parseFloat(totalHT)).toFixed(2);
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
        totalHT,
        totalTVA,
        notes: data.notes ?? null,
      });
    });
  }

  async createFactureLight(ctx: TenantContext, data: ImportFactureData): Promise<void> {
    const lignes = data.lignes ?? [];
    if (lignes.length === 0 && parseFloat(data.totalTTC || "0") > 0) {
      throw new ValidationError("Une facture importée avec un totalTTC > 0 doit comporter au moins une ligne");
    }
    const totalHT = round2(lignes.reduce((s, l) => s + (parseFloat(l.montantHT) || 0), 0)).toFixed(2);
    const totalTVA = round2(lignes.reduce((s, l) => s + (parseFloat(l.montantTVA) || 0), 0)).toFixed(2);
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
        totalHT,
        totalTVA,
      }).returning();
      for (const ligne of lignes) {
        const montantTTC = round2(parseFloat(ligne.montantHT) + parseFloat(ligne.montantTVA)).toFixed(2);
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
    });
  }

  listFactureNumeros(ctx: TenantContext): Promise<string[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx.select({ numero: facturesTable.numero }).from(facturesTable).where(eq(facturesTable.artisanId, ctx.artisanId));
      return rows.map((r) => r.numero).filter((n): n is string => n !== null);
    });
  }
}
