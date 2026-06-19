import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { devis, devisLignes, clients, parametresArtisan } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisRepository } from "../application/devis-repository";
import type {
  Devis,
  DevisLigne,
  CreateDevisInput,
  UpdateDevisInput,
  CreateDevisLigneInput,
  UpdateDevisLigneInput,
} from "../domain/devis";
import { calculerMontantsLigne, calculerTotaux } from "../application/montants";

type DevisRow = typeof devis.$inferSelect;
type LigneRow = typeof devisLignes.$inferSelect;

function toDevis(r: DevisRow): Devis {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    numero: r.numero,
    dateDevis: r.dateDevis,
    dateValidite: r.dateValidite ?? null,
    dateVue: r.dateVue ?? null,
    statut: (r.statut ?? "brouillon") as Devis["statut"],
    objet: r.objet ?? null,
    referenceClient: r.referenceClient ?? null,
    conditionsPaiement: r.conditionsPaiement ?? null,
    notes: r.notes ?? null,
    totalHT: r.totalHT ?? "0.00",
    totalTVA: r.totalTVA ?? "0.00",
    totalTTC: r.totalTTC ?? "0.00",
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toLigne(r: LigneRow): DevisLigne {
  return {
    id: r.id,
    devisId: r.devisId,
    ordre: r.ordre ?? 0,
    reference: r.reference ?? null,
    designation: r.designation,
    description: r.description ?? null,
    quantite: r.quantite ?? "0.00",
    unite: r.unite ?? "unité",
    prixUnitaireHT: r.prixUnitaireHT,
    tauxTVA: r.tauxTVA ?? "20.00",
    montantHT: r.montantHT ?? "0.00",
    montantTVA: r.montantTVA ?? "0.00",
    montantTTC: r.montantTTC ?? "0.00",
    type: (r.type ?? "produit") as DevisLigne["type"],
  };
}

/*
 * Implémentation Drizzle du repository devis. Double cloisonnement RLS + filtre `artisanId` sur
 * `devis`. Les `devis_lignes` (SANS artisanId) sont scopées via l'appartenance du devis parent
 * au tenant. ⚠️ Domaine financier : numérotation maîtrisée serveur (`nextNumero`, parité legacy
 * `getNextDevisNumber` — préfixe + compteur `parametres_artisan`), totaux TOUJOURS dérivés des
 * lignes (jamais fournis par le client), cascade lignes au delete.
 */
export class DevisRepositoryDrizzle implements IDevisRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Devis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(devis)
        .where(eq(devis.artisanId, ctx.artisanId))
        .orderBy(desc(devis.dateDevis), desc(devis.id));
      return rows.map(toDevis);
    });
  }

  listNonSignes(ctx: TenantContext): Promise<Devis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(devis)
        .where(and(eq(devis.artisanId, ctx.artisanId), inArray(devis.statut, ["brouillon", "envoye"])))
        .orderBy(desc(devis.dateDevis), desc(devis.id));
      return rows.map(toDevis);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Devis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(devis)
        .where(and(eq(devis.id, id), eq(devis.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toDevis(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateDevisInput): Promise<Devis> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(devis)
        .values({
          artisanId: ctx.artisanId,
          clientId: input.clientId,
          numero: input.numero,
          objet: input.objet ?? null,
          referenceClient: input.referenceClient ?? null,
          conditionsPaiement: input.conditionsPaiement ?? null,
          notes: input.notes ?? null,
          dateValidite: input.dateValidite ?? null,
          statut: "brouillon",
          totalHT: "0.00",
          totalTVA: "0.00",
          totalTTC: "0.00",
        })
        .returning();
      return toDevis(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateDevisInput): Promise<Devis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Métadonnées seulement (UpdateDevisInput exclut clientId/numero/statut/totaux). */
      const set: Partial<typeof devis.$inferInsert> = { updatedAt: new Date() };
      if (input.objet !== undefined) set.objet = input.objet;
      if (input.referenceClient !== undefined) set.referenceClient = input.referenceClient;
      if (input.conditionsPaiement !== undefined) set.conditionsPaiement = input.conditionsPaiement;
      if (input.notes !== undefined) set.notes = input.notes;
      if (input.dateValidite !== undefined) set.dateValidite = input.dateValidite;
      const [row] = await tx
        .update(devis)
        .set(set)
        .where(and(eq(devis.id, id), eq(devis.artisanId, ctx.artisanId)))
        .returning();
      return row ? toDevis(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsDevis(tx, ctx, id))) return false;
      /** Cascade : supprimer les lignes du devis (sans artisanId) dans la même transaction. */
      await tx.delete(devisLignes).where(eq(devisLignes.devisId, id));
      const deleted = await tx
        .delete(devis)
        .where(and(eq(devis.id, id), eq(devis.artisanId, ctx.artisanId)))
        .returning({ id: devis.id });
      return deleted.length > 0;
    });
  }

  setStatut(ctx: TenantContext, id: number, statut: Devis["statut"]): Promise<Devis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(devis)
        .set({ statut, updatedAt: new Date() })
        .where(and(eq(devis.id, id), eq(devis.artisanId, ctx.artisanId)))
        .returning();
      return row ? toDevis(row) : null;
    });
  }

  nextNumero(ctx: TenantContext): Promise<string> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Parité legacy `getNextDevisNumber` : préfixe + compteur persistés dans
       * `parametres_artisan`, borné par MAX(numero) en base (anti-doublon), compteur réavancé.
       */
      const [params] = await tx
        .select({ prefixe: parametresArtisan.prefixeDevis, compteur: parametresArtisan.compteurDevis })
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, ctx.artisanId))
        .limit(1);
      const prefixe = params?.prefixe || "DEV";
      const compteurParam = (params?.compteur ?? 0) + 1;

      const [maxRow] = await tx
        .select({ maxNum: sql<string | null>`max(${devis.numero})` })
        .from(devis)
        .where(eq(devis.artisanId, ctx.artisanId));
      let maxFromDb = 0;
      const m = maxRow?.maxNum?.match(/-(\d+)$/);
      if (m) maxFromDb = parseInt(m[1], 10) + 1;

      const compteur = Math.max(compteurParam, maxFromDb);
      if (params) {
        await tx.update(parametresArtisan).set({ compteurDevis: compteur }).where(eq(parametresArtisan.artisanId, ctx.artisanId));
      } else {
        await tx.insert(parametresArtisan).values({ artisanId: ctx.artisanId, compteurDevis: compteur });
      }
      return `${prefixe}-${String(compteur).padStart(5, "0")}`;
    });
  }

  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId)));
      return (row?.n ?? 0) > 0;
    });
  }

  listLignes(ctx: TenantContext, devisId: number): Promise<DevisLigne[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsDevis(tx, ctx, devisId))) return [];
      const rows = await tx
        .select()
        .from(devisLignes)
        .where(eq(devisLignes.devisId, devisId))
        .orderBy(asc(devisLignes.ordre), asc(devisLignes.id));
      return rows.map(toLigne);
    });
  }

  addLigne(ctx: TenantContext, devisId: number, input: CreateDevisLigneInput): Promise<DevisLigne | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsDevis(tx, ctx, devisId))) return null;
      const type = input.type ?? "produit";
      const isDisplay = type === "section" || type === "note";
      const quantite = isDisplay ? "0" : input.quantite ?? "1";
      const prixUnitaireHT = isDisplay ? "0" : input.prixUnitaireHT;
      const tauxTVA = isDisplay ? "0" : input.tauxTVA ?? "20.00";
      const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA);
      const [row] = await tx
        .insert(devisLignes)
        .values({
          devisId,
          ordre: input.ordre ?? 0,
          reference: isDisplay ? null : input.reference ?? null,
          designation: input.designation,
          description: input.description ?? null,
          quantite,
          unite: isDisplay ? "unité" : input.unite ?? "unité",
          prixUnitaireHT,
          tauxTVA,
          montantHT: montants.montantHT,
          montantTVA: montants.montantTVA,
          montantTTC: montants.montantTTC,
          type,
        })
        .returning();
      await this.recalculerTotaux(tx, devisId);
      return toLigne(row);
    });
  }

  updateLigne(ctx: TenantContext, ligneId: number, input: UpdateDevisLigneInput): Promise<DevisLigne | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** La ligne doit relever d'un devis appartenant au tenant (anti-IDOR via le parent). */
      const [ligne] = await tx.select().from(devisLignes).where(eq(devisLignes.id, ligneId)).limit(1);
      if (!ligne || !(await this.ownsDevis(tx, ctx, ligne.devisId))) return null;

      const type = input.type ?? (ligne.type ?? "produit");
      const isDisplay = type === "section" || type === "note";
      const quantite = isDisplay ? "0" : input.quantite ?? (ligne.quantite ?? "0");
      const prixUnitaireHT = isDisplay ? "0" : input.prixUnitaireHT ?? ligne.prixUnitaireHT;
      const tauxTVA = isDisplay ? "0" : input.tauxTVA ?? (ligne.tauxTVA ?? "20.00");
      const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA);

      const set: Partial<typeof devisLignes.$inferInsert> = {
        quantite,
        prixUnitaireHT,
        tauxTVA,
        type,
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
      };
      if (input.designation !== undefined) set.designation = input.designation;
      if (input.description !== undefined) set.description = input.description;
      if (input.reference !== undefined) set.reference = isDisplay ? null : input.reference;
      if (input.unite !== undefined) set.unite = isDisplay ? "unité" : input.unite;
      if (input.ordre !== undefined) set.ordre = input.ordre;

      const [row] = await tx.update(devisLignes).set(set).where(eq(devisLignes.id, ligneId)).returning();
      await this.recalculerTotaux(tx, ligne.devisId);
      return row ? toLigne(row) : null;
    });
  }

  deleteLigne(ctx: TenantContext, ligneId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [ligne] = await tx.select().from(devisLignes).where(eq(devisLignes.id, ligneId)).limit(1);
      if (!ligne || !(await this.ownsDevis(tx, ctx, ligne.devisId))) return false;
      await tx.delete(devisLignes).where(eq(devisLignes.id, ligneId));
      await this.recalculerTotaux(tx, ligne.devisId);
      return true;
    });
  }

  /** Recalcule les totaux du devis à partir de SES lignes (source de vérité). Server-side. */
  private async recalculerTotaux(tx: DbClient, devisId: number): Promise<void> {
    const lignes = await tx
      .select({ montantHT: devisLignes.montantHT, montantTVA: devisLignes.montantTVA, montantTTC: devisLignes.montantTTC })
      .from(devisLignes)
      .where(eq(devisLignes.devisId, devisId));
    const totaux = calculerTotaux(lignes.map((l) => ({
      montantHT: l.montantHT ?? "0.00",
      montantTVA: l.montantTVA ?? "0.00",
      montantTTC: l.montantTTC ?? "0.00",
    })));
    await tx
      .update(devis)
      .set({ totalHT: totaux.totalHT, totalTVA: totaux.totalTVA, totalTTC: totaux.totalTTC, updatedAt: new Date() })
      .where(eq(devis.id, devisId));
  }

  /** Le devis appartient-il au tenant ? (RLS + filtre artisanId) */
  private async ownsDevis(tx: DbClient, ctx: TenantContext, devisId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: devis.id })
      .from(devis)
      .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }
}
