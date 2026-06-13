import { and, asc, desc, eq, lt, isNotNull, notInArray, sql } from "drizzle-orm";
import {
  commandesFournisseurs,
  lignesCommandesFournisseurs,
  fournisseurs,
} from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ICommandeRepository, ReceptionLigne } from "../application/commande-repository";
import type {
  Commande,
  LigneCommande,
  CreateCommandeInput,
  CreateLigneInput,
  UpdateCommandeInput,
  CommandeStatut,
} from "../domain/commande";

type CommandeRow = typeof commandesFournisseurs.$inferSelect;
type LigneRow = typeof lignesCommandesFournisseurs.$inferSelect;

function toCommande(r: CommandeRow): Commande {
  return {
    id: r.id,
    artisanId: r.artisanId,
    fournisseurId: r.fournisseurId,
    numero: r.numero ?? null,
    reference: r.reference ?? null,
    dateCommande: r.dateCommande,
    dateLivraisonPrevue: r.dateLivraisonPrevue ?? null,
    dateLivraisonReelle: r.dateLivraisonReelle ?? null,
    statut: (r.statut ?? "brouillon") as Commande["statut"],
    totalHT: r.totalHT ?? null,
    totalTVA: r.totalTVA ?? null,
    totalTTC: r.totalTTC ?? null,
    montantTotal: r.montantTotal ?? null,
    adresseLivraison: r.adresseLivraison ?? null,
    notes: r.notes ?? null,
    statutFacturation: (r.statutFacturation ?? "a_facturer") as Commande["statutFacturation"],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toLigne(r: LigneRow): LigneCommande {
  return {
    id: r.id,
    commandeId: r.commandeId,
    articleId: r.articleId ?? null,
    stockId: r.stockId ?? null,
    designation: r.designation,
    reference: r.reference ?? null,
    quantite: r.quantite,
    quantiteRecue: r.quantiteRecue ?? "0.00",
    unite: r.unite ?? "unité",
    prixUnitaire: r.prixUnitaire ?? null,
    tauxTVA: r.tauxTVA ?? "20.00",
    montantTotal: r.montantTotal ?? null,
  };
}

// Totaux calculés CÔTÉ SERVEUR (jamais fournis par le client). Parité legacy :
// ligneHT = quantite × prixUnitaire ; ligneTVA = ligneHT × tauxTVA/100 ; totaux = Σ.
function calculerTotaux(lignes: readonly CreateLigneInput[]): {
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  lignesHT: number[];
} {
  let totalHT = 0;
  let totalTVA = 0;
  const lignesHT: number[] = [];
  for (const l of lignes) {
    const ligneHT = Number(l.quantite) * Number(l.prixUnitaire ?? 0);
    const ligneTVA = ligneHT * (Number(l.tauxTVA ?? "20") / 100);
    lignesHT.push(ligneHT);
    totalHT += ligneHT;
    totalTVA += ligneTVA;
  }
  return { totalHT, totalTVA, totalTTC: totalHT + totalTVA, lignesHT };
}

// Implémentation Drizzle du repository commandes fournisseurs. Double cloisonnement RLS +
// filtre artisanId sur `commandes_fournisseurs`. Lignes (SANS artisanId) scopées via la
// commande. ⚠️ Domaine sensible : totaux serveur, fournisseur owned, cascade lignes.
export class CommandeRepositoryDrizzle implements ICommandeRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Commande[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(commandesFournisseurs)
        .where(eq(commandesFournisseurs.artisanId, ctx.artisanId))
        .orderBy(desc(commandesFournisseurs.dateCommande), desc(commandesFournisseurs.id));
      return rows.map(toCommande);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Commande | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(commandesFournisseurs)
        .where(and(eq(commandesFournisseurs.id, id), eq(commandesFournisseurs.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toCommande(row) : null;
    });
  }

  listLignes(ctx: TenantContext, commandeId: number): Promise<LigneCommande[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsCommande(tx, ctx, commandeId))) return [];
      const rows = await tx
        .select()
        .from(lignesCommandesFournisseurs)
        .where(eq(lignesCommandesFournisseurs.commandeId, commandeId))
        .orderBy(asc(lignesCommandesFournisseurs.id));
      return rows.map(toLigne);
    });
  }

  create(ctx: TenantContext, input: CreateCommandeInput): Promise<Commande | null> {
    return withTenant(this.db, ctx, async (tx) => {
      // Le fournisseur référencé doit appartenir au tenant (anti-IDOR-FK).
      const [fourn] = await tx
        .select({ id: fournisseurs.id })
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, input.fournisseurId), eq(fournisseurs.artisanId, ctx.artisanId)))
        .limit(1);
      if (!fourn) return null;

      const { totalHT, totalTVA, totalTTC, lignesHT } = calculerTotaux(input.lignes);

      const [commande] = await tx
        .insert(commandesFournisseurs)
        .values({
          artisanId: ctx.artisanId,
          fournisseurId: input.fournisseurId,
          reference: input.reference ?? null,
          dateLivraisonPrevue: input.dateLivraisonPrevue ?? null,
          adresseLivraison: input.adresseLivraison ?? null,
          notes: input.notes ?? null,
          statut: "brouillon",
          totalHT: totalHT.toFixed(2),
          totalTVA: totalTVA.toFixed(2),
          totalTTC: totalTTC.toFixed(2),
          montantTotal: totalTTC.toFixed(2),
        })
        .returning();

      // Numéro dérivé de l'id (séquence per-tenant à industrialiser ultérieurement).
      const numero = `CMD-${String(commande.id).padStart(5, "0")}`;
      await tx
        .update(commandesFournisseurs)
        .set({ numero })
        .where(eq(commandesFournisseurs.id, commande.id));

      for (let i = 0; i < input.lignes.length; i++) {
        const l = input.lignes[i];
        await tx.insert(lignesCommandesFournisseurs).values({
          commandeId: commande.id,
          articleId: l.articleId ?? null,
          designation: l.designation,
          reference: l.reference ?? null,
          quantite: Number(l.quantite).toFixed(2),
          unite: l.unite ?? "unité",
          prixUnitaire: l.prixUnitaire != null ? Number(l.prixUnitaire).toFixed(2) : null,
          tauxTVA: Number(l.tauxTVA ?? "20").toFixed(2),
          montantTotal: lignesHT[i].toFixed(2),
        });
      }

      return toCommande({ ...commande, numero });
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateCommandeInput): Promise<Commande | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(commandesFournisseurs)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(commandesFournisseurs.id, id), eq(commandesFournisseurs.artisanId, ctx.artisanId)))
        .returning();
      return row ? toCommande(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsCommande(tx, ctx, id))) return false;
      await tx.delete(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, id));
      const deleted = await tx
        .delete(commandesFournisseurs)
        .where(and(eq(commandesFournisseurs.id, id), eq(commandesFournisseurs.artisanId, ctx.artisanId)))
        .returning({ id: commandesFournisseurs.id });
      return deleted.length > 0;
    });
  }

  updateStatut(
    ctx: TenantContext,
    id: number,
    statut: CommandeStatut,
    dateLivraisonReelle?: Date | null,
  ): Promise<Commande | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set: Record<string, unknown> = { statut, updatedAt: new Date() };
      if (dateLivraisonReelle !== undefined) set.dateLivraisonReelle = dateLivraisonReelle;
      const [row] = await tx
        .update(commandesFournisseurs)
        .set(set)
        .where(and(eq(commandesFournisseurs.id, id), eq(commandesFournisseurs.artisanId, ctx.artisanId)))
        .returning();
      return row ? toCommande(row) : null;
    });
  }

  listEnRetard(ctx: TenantContext): Promise<Commande[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await tx
        .select()
        .from(commandesFournisseurs)
        .where(
          and(
            eq(commandesFournisseurs.artisanId, ctx.artisanId),
            isNotNull(commandesFournisseurs.dateLivraisonPrevue),
            lt(sql`${commandesFournisseurs.dateLivraisonPrevue}::date`, today),
            notInArray(commandesFournisseurs.statut, ["livree", "annulee"]),
          ),
        )
        .orderBy(asc(commandesFournisseurs.dateLivraisonPrevue));
      return rows.map(toCommande);
    });
  }

  recevoir(ctx: TenantContext, commandeId: number, receptions: ReceptionLigne[]): Promise<Commande | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [commande] = await tx
        .select()
        .from(commandesFournisseurs)
        .where(and(eq(commandesFournisseurs.id, commandeId), eq(commandesFournisseurs.artisanId, ctx.artisanId)))
        .limit(1);
      if (!commande) return null;

      const lignes = await tx
        .select()
        .from(lignesCommandesFournisseurs)
        .where(eq(lignesCommandesFournisseurs.commandeId, commandeId));
      const ligneById = new Map(lignes.map((l) => [l.id, l]));

      // Dédoublonne par ligneId (dernière valeur) ; ignore les ligneId hors commande.
      const recueParLigne = new Map<number, number>();
      for (const r of receptions) {
        if (ligneById.has(r.ligneId)) recueParLigne.set(r.ligneId, r.quantiteRecue);
      }

      for (const [ligneId, quantiteRecue] of Array.from(recueParLigne.entries())) {
        const ligne = ligneById.get(ligneId)!;
        // Invariant garanti côté infra : qté reçue ∈ [0, quantité commandée] (clamp défensif).
        const max = Number(ligne.quantite);
        const valeur = Math.max(0, Math.min(quantiteRecue, max));
        await tx
          .update(lignesCommandesFournisseurs)
          .set({ quantiteRecue: valeur.toFixed(2) })
          .where(eq(lignesCommandesFournisseurs.id, ligneId));
      }

      // Recalcule le statut depuis les quantités reçues (source de vérité = lignes).
      const apres = await tx
        .select()
        .from(lignesCommandesFournisseurs)
        .where(eq(lignesCommandesFournisseurs.commandeId, commandeId));
      let totalCommande = 0;
      let totalRecu = 0;
      let toutRecu = true;
      for (const l of apres) {
        const cmd = Number(l.quantite);
        const recu = Number(l.quantiteRecue ?? 0);
        totalCommande += cmd;
        totalRecu += recu;
        if (recu < cmd) toutRecu = false;
      }
      const set: Record<string, unknown> = { updatedAt: new Date() };
      // On ne sort pas d'un état terminal (annulee) ni du brouillon via la réception.
      if (commande.statut !== "annulee" && commande.statut !== "brouillon") {
        if (totalCommande > 0 && toutRecu) set.statut = "livree";
        else if (totalRecu > 0) set.statut = "partiellement_livree";
        else set.statut = "confirmee";
      }
      if (totalRecu > 0 && !commande.dateLivraisonReelle) set.dateLivraisonReelle = new Date();

      const [row] = await tx
        .update(commandesFournisseurs)
        .set(set)
        .where(and(eq(commandesFournisseurs.id, commandeId), eq(commandesFournisseurs.artisanId, ctx.artisanId)))
        .returning();
      return row ? toCommande(row) : null;
    });
  }

  // La commande appartient-elle au tenant ? (RLS + filtre artisanId)
  private async ownsCommande(tx: DbClient, ctx: TenantContext, commandeId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: commandesFournisseurs.id })
      .from(commandesFournisseurs)
      .where(and(eq(commandesFournisseurs.id, commandeId), eq(commandesFournisseurs.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }
}
