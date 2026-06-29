import { and, asc, desc, eq, sql, sum } from "drizzle-orm";
import { factures, facturesLignes, clients, devis, parametresArtisan, eventLog, reglements } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import { ValidationError } from "../../../shared/errors";
import type { IFactureRepository, PaiementPatch, CreateAvoirInput, CreateFromDevisInput, Reglement, CreateReglementInput } from "../application/facture-repository";
import type {
  Facture,
  FactureLigne,
  FactureStatut,
  CreateFactureInput,
  UpdateFactureInput,
  CreateFactureLigneInput,
  UpdateFactureLigneInput,
  AuditLogEntry,
} from "../domain/facture";
import { calculerMontantsLigne, calculerTotaux, appliquerRegimeTVA } from "../application/montants";

type FactureRow = typeof factures.$inferSelect;
type LigneRow = typeof facturesLignes.$inferSelect;
type AuditRow = typeof eventLog.$inferSelect;

function toAuditEntry(r: AuditRow): AuditLogEntry {
  return {
    id: r.id,
    userId: r.userId ?? 0,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    details: r.details ?? null,
    createdAt: r.createdAt,
  };
}

function toFacture(r: FactureRow): Facture {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    devisId: r.devisId ?? null,
    numero: r.numero,
    dateFacture: r.dateFacture,
    dateEcheance: r.dateEcheance ?? null,
    statut: (r.statut ?? "brouillon") as Facture["statut"],
    typeDocument: (r.typeDocument ?? "facture") as Facture["typeDocument"],
    factureOrigineId: r.factureOrigineId ?? null,
    objet: r.objet ?? null,
    referenceClient: r.referenceClient ?? null,
    siretDestinataire: r.siretDestinataire ?? null,
    conditionsPaiement: r.conditionsPaiement ?? null,
    notes: r.notes ?? null,
    totalHT: r.totalHT ?? "0.00",
    totalTVA: r.totalTVA ?? "0.00",
    totalTTC: r.totalTTC ?? "0.00",
    montantPaye: r.montantPaye ?? "0.00",
    datePaiement: r.datePaiement ?? null,
    modePaiement: r.modePaiement ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    nombreRelances: r.nombreRelances ?? 0,
    regimeTVA: (r.regimeTVA ?? "normal") as Facture["regimeTVA"],
    pdfFileId: r.pdfFileId ?? null,
    pdfStorageKey: r.pdfStorageKey ?? null,
    estAcompte: r.estAcompte ?? false,
  };
}

function toLigne(r: LigneRow): FactureLigne {
  return {
    id: r.id,
    factureId: r.factureId,
    ordre: r.ordre ?? 0,
    articleId: r.articleId ?? null,
    reference: r.reference ?? null,
    designation: r.designation,
    description: r.description ?? null,
    quantite: r.quantite ?? "0.00",
    unite: r.unite ?? "unité",
    prixUnitaireHT: r.prixUnitaireHT,
    tauxTVA: r.tauxTVA ?? "20.00",
    tvaCategorieId: r.tvaCategorieId ?? null,
    remise: r.remise ?? "0.00",
    montantHT: r.montantHT ?? "0.00",
    montantTVA: r.montantTVA ?? "0.00",
    montantTTC: r.montantTTC ?? "0.00",
    type: (r.type ?? "produit") as FactureLigne["type"],
  };
}

type ReglementRow = typeof reglements.$inferSelect;

function toReglement(r: ReglementRow): Reglement {
  const dateStr = r.date;
  const dateObj = typeof dateStr === "string" ? new Date(dateStr + "T00:00:00Z") : dateStr;
  return {
    id: r.id,
    factureId: r.factureId,
    artisanId: r.artisanId,
    montant: r.montant ?? "0.00",
    date: dateObj,
    mode: (r.mode || "autre") as "cheque" | "virement" | "especes" | "carte" | "autre",
    reference: r.reference ?? null,
    note: r.note ?? null,
    createdAt: r.createdAt,
  };
}

/*
 * Implémentation Drizzle du repository factures. Double cloisonnement RLS + filtre `artisanId`
 * sur `factures`. Les `factures_lignes` (SANS artisanId) sont scopées via la facture parente du
 * tenant. ⚠️ Domaine financier CRITIQUE : numérotation maîtrisée serveur (`nextNumero`, parité
 * legacy `getNextFactureNumber`), totaux TOUJOURS dérivés des lignes (jamais fournis par le
 * client), cascade lignes au delete. (Immutabilité post-émission portée par les use-cases.)
 */
export class FactureRepositoryDrizzle implements IFactureRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Facture[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(factures)
        .where(eq(factures.artisanId, ctx.artisanId))
        .orderBy(desc(factures.dateFacture), desc(factures.id));
      return rows.map(toFacture);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Facture | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(factures)
        .where(and(eq(factures.id, id), eq(factures.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toFacture(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateFactureInput): Promise<Facture> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(factures)
        .values({
          artisanId: ctx.artisanId,
          clientId: input.clientId,
          devisId: input.devisId ?? null,
          numero: input.numero,
          typeDocument: input.typeDocument ?? "facture",
          factureOrigineId: input.factureOrigineId ?? null,
          objet: input.objet ?? null,
          referenceClient: input.referenceClient ?? null,
          siretDestinataire: input.siretDestinataire ?? null,
          conditionsPaiement: input.conditionsPaiement ?? null,
          notes: input.notes ?? null,
          dateEcheance: input.dateEcheance ?? null,
          statut: "brouillon",
          regimeTVA: input.regimeTVA ?? "normal",
          estAcompte: input.estAcompte ?? false,
          totalHT: "0.00",
          totalTVA: "0.00",
          totalTTC: "0.00",
          montantPaye: "0.00",
        })
        .returning();
      return toFacture(row);
    });
  }

  createWithLignes(ctx: TenantContext, header: CreateFactureInput, lignes: readonly CreateFactureLigneInput[], inTx?: (tx: DbClient) => Promise<void>): Promise<Facture> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(factures)
        .values({
          artisanId: ctx.artisanId,
          clientId: header.clientId,
          devisId: header.devisId ?? null,
          numero: header.numero,
          typeDocument: header.typeDocument ?? "facture",
          factureOrigineId: header.factureOrigineId ?? null,
          objet: header.objet ?? null,
          referenceClient: header.referenceClient ?? null,
          siretDestinataire: header.siretDestinataire ?? null,
          conditionsPaiement: header.conditionsPaiement ?? null,
          notes: header.notes ?? null,
          dateEcheance: header.dateEcheance ?? null,
          statut: "brouillon",
          regimeTVA: header.regimeTVA ?? "normal",
          estAcompte: header.estAcompte ?? false,
          totalHT: "0.00",
          totalTVA: "0.00",
          totalTTC: "0.00",
          montantPaye: "0.00",
        })
        .returning();
      const insertedMontants: { montantHT: string; montantTVA: string; montantTTC: string }[] = [];
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        const type = l.type ?? "produit";
        const isDisplay = type === "section" || type === "note";
        const quantite = isDisplay ? "0" : l.quantite ?? "1";
        const prixUnitaireHT = isDisplay ? "0" : l.prixUnitaireHT;
        const tauxTVA = isDisplay ? "0" : l.tauxTVA ?? "20.00";
        const remise = isDisplay ? "0" : l.remise ?? "0";
        const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA, remise);
        await tx.insert(facturesLignes).values({
          factureId: row.id,
          ordre: l.ordre ?? i,
          reference: isDisplay ? null : l.reference ?? null,
          designation: l.designation,
          description: l.description ?? null,
          quantite,
          unite: isDisplay ? "unité" : l.unite ?? "unité",
          prixUnitaireHT,
          tauxTVA,
          remise,
          tvaCategorieId: isDisplay ? null : (l.tvaCategorieId ?? null),
          montantHT: montants.montantHT,
          montantTVA: montants.montantTVA,
          montantTTC: montants.montantTTC,
          type,
        });
        insertedMontants.push(montants);
      }
      if (insertedMontants.length === 0) {
        if (inTx) await inTx(tx);
        return toFacture(row);
      }
      const totauxBruts = calculerTotaux(insertedMontants);
      const totaux = appliquerRegimeTVA(totauxBruts, header.regimeTVA ?? "normal");
      const [updated] = await tx
        .update(factures)
        .set({ totalHT: totaux.totalHT, totalTVA: totaux.totalTVA, totalTTC: totaux.totalTTC, updatedAt: new Date() })
        .where(eq(factures.id, row.id))
        .returning();
      if (inTx) await inTx(tx);
      return toFacture(updated);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateFactureInput): Promise<Facture | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Métadonnées seulement (UpdateFactureInput exclut clientId/devisId/numero/statut/totaux). */
      const set: Partial<typeof factures.$inferInsert> = { updatedAt: new Date() };
      if (input.objet !== undefined) set.objet = input.objet;
      if (input.referenceClient !== undefined) set.referenceClient = input.referenceClient;
      if (input.siretDestinataire !== undefined) set.siretDestinataire = input.siretDestinataire;
      if (input.conditionsPaiement !== undefined) set.conditionsPaiement = input.conditionsPaiement;
      if (input.notes !== undefined) set.notes = input.notes;
      if (input.dateEcheance !== undefined) set.dateEcheance = input.dateEcheance;
      if (input.nombreRelances !== undefined) set.nombreRelances = input.nombreRelances;
      if (input.regimeTVA !== undefined) set.regimeTVA = input.regimeTVA;
      const [row] = await tx
        .update(factures)
        .set(set)
        .where(and(eq(factures.id, id), eq(factures.artisanId, ctx.artisanId)))
        .returning();
      return row ? toFacture(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsFacture(tx, ctx, id))) return false;
      /** cascade */
      await tx.delete(facturesLignes).where(eq(facturesLignes.factureId, id));
      const deleted = await tx
        .delete(factures)
        .where(and(eq(factures.id, id), eq(factures.artisanId, ctx.artisanId)))
        .returning({ id: factures.id });
      return deleted.length > 0;
    });
  }

  setStatut(ctx: TenantContext, id: number, statut: FactureStatut, inTx?: (tx: DbClient) => Promise<void>): Promise<Facture | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(factures)
        .set({ statut, updatedAt: new Date() })
        .where(and(eq(factures.id, id), eq(factures.artisanId, ctx.artisanId)))
        .returning();
      if (row && inTx) await inTx(tx);
      return row ? toFacture(row) : null;
    });
  }

  enregistrerPaiement(ctx: TenantContext, id: number, patch: PaiementPatch): Promise<Facture | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(factures)
        .set({
          montantPaye: patch.montantPaye,
          datePaiement: patch.datePaiement,
          modePaiement: patch.modePaiement,
          statut: patch.statut,
          updatedAt: new Date(),
        })
        .where(and(eq(factures.id, id), eq(factures.artisanId, ctx.artisanId)))
        .returning();
      return row ? toFacture(row) : null;
    });
  }

  async ajouterReglement(ctx: TenantContext, input: CreateReglementInput): Promise<Reglement | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [facture] = await tx
        .select()
        .from(factures)
        .where(and(eq(factures.id, input.factureId), eq(factures.artisanId, ctx.artisanId)))
        .limit(1);

      if (!facture) return null;

      await tx.execute(sql`SELECT * FROM "factures" WHERE id = ${input.factureId} FOR UPDATE`);

      const [sumResult] = await tx
        .select({ total: sum(reglements.montant) })
        .from(reglements)
        .where(eq(reglements.factureId, input.factureId));

      const currentSum = sumResult?.total ? Number(sumResult.total) : 0;
      const montantNum = Number(input.montant);
      const totalTTC = Number(facture.totalTTC) || 0;
      const cumul = currentSum + montantNum;

      if (cumul > totalTTC + 0.005) throw new ValidationError("Le montant payé dépasse le total TTC de la facture");

      const isoDate = input.date.toISOString().split("T")[0];

      const [reglement] = await tx
        .insert(reglements)
        .values({
          factureId: input.factureId,
          artisanId: ctx.artisanId,
          montant: input.montant,
          date: isoDate,
          mode: input.mode,
          reference: input.reference,
          note: input.note,
          createdAt: new Date(),
        })
        .returning();

      if (!reglement) return null;

      const newMontantPaye = cumul.toFixed(2);
      const soldee = totalTTC > 0 && cumul >= totalTTC - 0.005;

      await tx
        .update(factures)
        .set({
          montantPaye: newMontantPaye,
          statut: soldee ? "payee" : facture.statut,
          updatedAt: new Date(),
        })
        .where(eq(factures.id, input.factureId));

      return toReglement(reglement);
    });
  }

  nextNumero(ctx: TenantContext): Promise<string> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Verrou advisory par tenant (namespace 1 = allocation numéro) : sérialise les appels
       * concurrents pour le même artisan sans exiger que la ligne parametres_artisan existe.
       * Le verrou est libéré automatiquement en fin de transaction (pg_advisory_xact_lock).
       */
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1, ${ctx.artisanId})`);
      const [params] = await tx
        .select({ prefixe: parametresArtisan.prefixeFacture, compteur: parametresArtisan.compteurFacture })
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, ctx.artisanId))
        .limit(1);
      const prefixe = params?.prefixe || "FAC";
      const compteurParam = (params?.compteur ?? 0) + 1;

      const [maxRow] = await tx
        .select({ maxNum: sql<string | null>`max(${factures.numero})` })
        .from(factures)
        .where(eq(factures.artisanId, ctx.artisanId));
      let maxFromDb = 0;
      const m = maxRow?.maxNum?.match(/-(\d+)$/);
      if (m) maxFromDb = parseInt(m[1], 10) + 1;

      const compteur = Math.max(compteurParam, maxFromDb);
      if (params) {
        await tx.update(parametresArtisan).set({ compteurFacture: compteur }).where(eq(parametresArtisan.artisanId, ctx.artisanId));
      } else {
        await tx.insert(parametresArtisan).values({ artisanId: ctx.artisanId, compteurFacture: compteur });
      }
      return `${prefixe}-${String(compteur).padStart(5, "0")}`;
    });
  }

  async assignNumero(ctx: TenantContext, id: number, numero: string): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(factures)
        .set({ numero, updatedAt: new Date() })
        .where(and(eq(factures.id, id), eq(factures.artisanId, ctx.artisanId)));
    });
  }

  nextNumeroAvoir(ctx: TenantContext): Promise<string> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Verrou advisory tenant (namespace 1) — sérialise l'allocation du numéro avoir. */
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1, ${ctx.artisanId})`);
      const [params] = await tx
        .select({ prefixe: parametresArtisan.prefixeAvoir, compteur: parametresArtisan.compteurAvoir })
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, ctx.artisanId))
        .limit(1);
      const prefixe = params?.prefixe || "AV";
      const compteurParam = (params?.compteur ?? 0) + 1;

      const [maxRow] = await tx
        .select({ maxNum: sql<string | null>`max(${factures.numero})` })
        .from(factures)
        .where(and(eq(factures.artisanId, ctx.artisanId), eq(factures.typeDocument, "avoir")));
      let maxFromDb = 0;
      const m = maxRow?.maxNum?.match(/-(\d+)$/);
      if (m) maxFromDb = parseInt(m[1], 10) + 1;

      const compteur = Math.max(compteurParam, maxFromDb);
      if (params) {
        await tx.update(parametresArtisan).set({ compteurAvoir: compteur }).where(eq(parametresArtisan.artisanId, ctx.artisanId));
      } else {
        await tx.insert(parametresArtisan).values({ artisanId: ctx.artisanId, compteurAvoir: compteur });
      }
      return `${prefixe}-${String(compteur).padStart(5, "0")}`;
    });
  }

  listAvoirs(ctx: TenantContext, factureOrigineId: number): Promise<Facture[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(factures)
        .where(
          and(
            eq(factures.artisanId, ctx.artisanId),
            eq(factures.typeDocument, "avoir"),
            eq(factures.factureOrigineId, factureOrigineId),
          ),
        );
      return rows.map(toFacture);
    });
  }

  listAuditLog(ctx: TenantContext, factureId: number): Promise<AuditLogEntry[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(eventLog)
        .where(
          and(
            eq(eventLog.artisanId, ctx.artisanId),
            eq(eventLog.entityType, "facture"),
            eq(eventLog.entityId, factureId),
          ),
        )
        .orderBy(desc(eventLog.createdAt));
      return rows.map(toAuditEntry);
    });
  }

  createAvoir(ctx: TenantContext, input: CreateAvoirInput): Promise<Facture | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** La facture d'origine doit appartenir au tenant (anti-IDOR-FK). */
      if (!(await this.ownsFacture(tx, ctx, input.factureOrigineId))) return null;
      const totaux = calculerTotaux(input.lignes);
      const [avoir] = await tx
        .insert(factures)
        .values({
          artisanId: ctx.artisanId,
          clientId: input.clientId,
          numero: input.numero,
          typeDocument: "avoir",
          factureOrigineId: input.factureOrigineId,
          statut: "validee",
          objet: input.objet,
          notes: input.notes,
          conditionsPaiement: input.conditionsPaiement,
          totalHT: totaux.totalHT,
          totalTVA: totaux.totalTVA,
          totalTTC: totaux.totalTTC,
          montantPaye: "0.00",
        })
        .returning();
      for (let i = 0; i < input.lignes.length; i++) {
        const l = input.lignes[i];
        await tx.insert(facturesLignes).values({
          factureId: avoir.id,
          ordre: i,
          designation: l.designation,
          description: l.description,
          quantite: l.quantite,
          unite: l.unite ?? "unité",
          prixUnitaireHT: l.prixUnitaireHT,
          tauxTVA: l.tauxTVA,
          tvaCategorieId: l.tvaCategorieId ?? null,
          montantHT: l.montantHT,
          montantTVA: l.montantTVA,
          montantTTC: l.montantTTC,
          type: "produit",
        });
      }
      return toFacture(avoir);
    });
  }

  existsForDevis(ctx: TenantContext, devisId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(factures)
        .where(and(eq(factures.artisanId, ctx.artisanId), eq(factures.devisId, devisId), eq(factures.typeDocument, "facture"), eq(factures.estAcompte, false)));
      return (row?.n ?? 0) > 0;
    });
  }

  listAcomptes(ctx: TenantContext, devisId: number): Promise<Facture[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(factures)
        .where(and(eq(factures.artisanId, ctx.artisanId), eq(factures.devisId, devisId), eq(factures.typeDocument, "facture"), eq(factures.estAcompte, true)))
        .orderBy(asc(factures.id));
      return rows.map(toFacture);
    });
  }

  createFromDevis(ctx: TenantContext, input: CreateFromDevisInput): Promise<Facture | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Le client référencé (hérité du devis) doit appartenir au tenant (anti-IDOR-FK). */
      const [cli] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);
      if (!cli) return null;
      const totaux = calculerTotaux(input.lignes);
      const [facture] = await tx
        .insert(factures)
        .values({
          artisanId: ctx.artisanId,
          clientId: input.clientId,
          devisId: input.devisId,
          numero: input.numero,
          typeDocument: "facture",
          statut: "brouillon",
          objet: input.objet,
          referenceClient: input.referenceClient,
          conditionsPaiement: input.conditionsPaiement,
          notes: input.notes,
          totalHT: totaux.totalHT,
          totalTVA: totaux.totalTVA,
          totalTTC: totaux.totalTTC,
          montantPaye: "0.00",
        })
        .returning();
      for (const l of input.lignes) {
        await tx.insert(facturesLignes).values({
          factureId: facture.id,
          ordre: l.ordre,
          reference: l.reference,
          designation: l.designation,
          description: l.description,
          quantite: l.quantite,
          unite: l.unite,
          prixUnitaireHT: l.prixUnitaireHT,
          tauxTVA: l.tauxTVA,
          remise: l.remise ?? "0",
          tvaCategorieId: l.tvaCategorieId ?? null,
          montantHT: l.montantHT,
          montantTVA: l.montantTVA,
          montantTTC: l.montantTTC,
          type: l.type as "produit" | "section" | "note",
        });
      }
      return toFacture(facture);
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

  ownsDevis(ctx: TenantContext, devisId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(devis)
        .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)));
      return (row?.n ?? 0) > 0;
    });
  }

  listLignes(ctx: TenantContext, factureId: number): Promise<FactureLigne[]> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsFacture(tx, ctx, factureId))) return [];
      const rows = await tx
        .select()
        .from(facturesLignes)
        .where(eq(facturesLignes.factureId, factureId))
        .orderBy(asc(facturesLignes.ordre), asc(facturesLignes.id));
      return rows.map(toLigne);
    });
  }

  addLigne(ctx: TenantContext, factureId: number, input: CreateFactureLigneInput): Promise<FactureLigne | null> {
    return withTenant(this.db, ctx, async (tx) => {
      if (!(await this.ownsFacture(tx, ctx, factureId))) return null;
      const type = input.type ?? "produit";
      const isDisplay = type === "section" || type === "note";
      const quantite = isDisplay ? "0" : input.quantite ?? "1";
      const prixUnitaireHT = isDisplay ? "0" : input.prixUnitaireHT;
      const tauxTVA = isDisplay ? "0" : input.tauxTVA ?? "20.00";
      const remise = isDisplay ? "0" : input.remise ?? "0";
      const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA, remise);
      const [row] = await tx
        .insert(facturesLignes)
        .values({
          factureId,
          ordre: input.ordre ?? 0,
          articleId: isDisplay ? null : (input.articleId ?? null),
          reference: isDisplay ? null : input.reference ?? null,
          designation: input.designation,
          description: input.description ?? null,
          quantite,
          unite: isDisplay ? "unité" : input.unite ?? "unité",
          prixUnitaireHT,
          tauxTVA,
          remise,
          tvaCategorieId: isDisplay ? null : (input.tvaCategorieId ?? null),
          montantHT: montants.montantHT,
          montantTVA: montants.montantTVA,
          montantTTC: montants.montantTTC,
          type,
        })
        .returning();
      await this.recalculerTotaux(tx, factureId);
      return toLigne(row);
    });
  }

  updateLigne(ctx: TenantContext, ligneId: number, input: UpdateFactureLigneInput): Promise<FactureLigne | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [ligne] = await tx.select().from(facturesLignes).where(eq(facturesLignes.id, ligneId)).limit(1);
      if (!ligne || !(await this.ownsFacture(tx, ctx, ligne.factureId))) return null;

      const type = input.type ?? (ligne.type ?? "produit");
      const isDisplay = type === "section" || type === "note";
      const quantite = isDisplay ? "0" : input.quantite ?? (ligne.quantite ?? "0");
      const prixUnitaireHT = isDisplay ? "0" : input.prixUnitaireHT ?? ligne.prixUnitaireHT;
      const tauxTVA = isDisplay ? "0" : input.tauxTVA ?? (ligne.tauxTVA ?? "20.00");
      const remise = isDisplay ? "0" : input.remise ?? (ligne.remise ?? "0");
      const montants = calculerMontantsLigne(type, quantite, prixUnitaireHT, tauxTVA, remise);

      const set: Partial<typeof facturesLignes.$inferInsert> = {
        quantite,
        prixUnitaireHT,
        tauxTVA,
        remise,
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
      if (input.tvaCategorieId !== undefined) set.tvaCategorieId = isDisplay ? null : input.tvaCategorieId;

      const [row] = await tx.update(facturesLignes).set(set).where(eq(facturesLignes.id, ligneId)).returning();
      await this.recalculerTotaux(tx, ligne.factureId);
      return row ? toLigne(row) : null;
    });
  }

  deleteLigne(ctx: TenantContext, ligneId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [ligne] = await tx.select().from(facturesLignes).where(eq(facturesLignes.id, ligneId)).limit(1);
      if (!ligne || !(await this.ownsFacture(tx, ctx, ligne.factureId))) return false;
      await tx.delete(facturesLignes).where(eq(facturesLignes.id, ligneId));
      await this.recalculerTotaux(tx, ligne.factureId);
      return true;
    });
  }

  /** Recalcule les totaux de la facture à partir de SES lignes (source de vérité). Server-side. */
  private async recalculerTotaux(tx: DbClient, factureId: number): Promise<void> {
    const [facture] = await tx
      .select({ regimeTVA: factures.regimeTVA })
      .from(factures)
      .where(eq(factures.id, factureId))
      .limit(1);
    const lignes = await tx
      .select({ montantHT: facturesLignes.montantHT, montantTVA: facturesLignes.montantTVA, montantTTC: facturesLignes.montantTTC })
      .from(facturesLignes)
      .where(eq(facturesLignes.factureId, factureId));
    const totauxBruts = calculerTotaux(lignes.map((l) => ({
      montantHT: l.montantHT ?? "0.00",
      montantTVA: l.montantTVA ?? "0.00",
      montantTTC: l.montantTTC ?? "0.00",
    })));
    const totaux = appliquerRegimeTVA(totauxBruts, facture?.regimeTVA ?? "normal");
    await tx
      .update(factures)
      .set({ totalHT: totaux.totalHT, totalTVA: totaux.totalTVA, totalTTC: totaux.totalTTC, updatedAt: new Date() })
      .where(eq(factures.id, factureId));
  }

  setPdfFile(ctx: TenantContext, factureId: number, fileId: number, storageKey: string): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(factures)
        .set({ pdfFileId: fileId, pdfStorageKey: storageKey, updatedAt: new Date() })
        .where(and(eq(factures.id, factureId), eq(factures.artisanId, ctx.artisanId)));
    });
  }

  withDb(db: DbClient): FactureRepositoryDrizzle {
    return new FactureRepositoryDrizzle(db);
  }

  /** La facture appartient-elle au tenant ? (RLS + filtre artisanId) */
  private async ownsFacture(tx: DbClient, ctx: TenantContext, factureId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: factures.id })
      .from(factures)
      .where(and(eq(factures.id, factureId), eq(factures.artisanId, ctx.artisanId)))
      .limit(1);
    return Boolean(row);
  }
}
