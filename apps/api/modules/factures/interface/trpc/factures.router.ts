import { z } from "zod";
import { router, protectedProcedure, permissionProcedure } from "../../../../interface/trpc/trpc";

/** Permissions factures (parité legacy) : créer/modifier/émettre/encaisser/avoir = `factures.creer` ; supprimer = `factures.supprimer`. */
const facturesCreer = permissionProcedure("factures.creer");
const facturesSupprimer = permissionProcedure("factures.supprimer");
import { TVA_CATEGORIES_MAP } from "../../../../shared/tva/taux-tva-fr";
import type { IFactureRepository } from "../../application/facture-repository";
import type { IDevisReader } from "../../application/devis-reader";
import type { ComptaPort } from "../../application/compta-port";
import type { FactureMailingDeps } from "../../application/envoyer-facture-email";
import type { PushPort } from "../../../../shared/push/web-push-adapter";
import type { DbClient } from "../../../../shared/db";
import type { IStockRepository } from "../../../stocks/application/stock-repository";
import type { StoragePort } from "../../../../shared/ports/storage";
import type { INotificationRepository } from "../../../notifications/application/notification-repository";
import type { TenantContext } from "../../../../shared/tenant";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { envoyerFactureParEmail } from "../../application/envoyer-facture-email";
import { listFactures, getFactureDetail, listLignesFacture, getAvoirsFacture, getAuditLogFacture } from "../../application/read-use-cases";
import type { IAttestationTvaRepository } from "../../application/attestation-tva-repository";
import { necessite_attestation_tva_reduite } from "../../application/montants";
import { generateAttestationTvaPDF } from "../../../../shared/pdf/pdf-generator";
import { TRPCError } from "@trpc/server";
import {
  creerFacture,
  modifierFacture,
  supprimerFacture,
  ajouterLigneFacture,
  modifierLigneFacture,
  supprimerLigneFacture,
  changerStatutFacture,
  enregistrerPaiementFacture,
  ajouterReglement,
  creerAvoir,
  convertirDevisEnFacture,
  facturerSituation,
  facturerAcompte,
  facturerSolde,
} from "../../application/write-use-cases";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format AAAA-MM-JJ attendu)");
const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");
const ligneTypeEnum = z.enum(["produit", "section", "note"]);
const typeDocumentEnum = z.enum(["facture", "avoir"]);
const tvaCategorieEnum = z.enum(["FR_20", "FR_10", "FR_5_5", "FR_2_1", "FR_FRANCHISE", "FR_EXONERE", "FR_AUTO"]);
const regimeTVAEnum = z.enum(["normal", "autoliquidation_btp", "exonere"]);

/** `dateEcheance` arrive en string ISO (transport) ; le domaine attend une `Date | null`. */
function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined || v === null) return v;
  return new Date(v);
}

const ligneCreateSchema = z.object({
  designation: z.string().min(1).max(500),
  prixUnitaireHT: decimal,
  quantite: decimal.optional(),
  unite: z.string().max(20).optional(),
  tvaCategorieId: tvaCategorieEnum.optional(),
  articleId: z.number().int().nullish(),
  reference: z.string().max(50).nullish(),
  description: z.string().max(5000).nullish(),
  ordre: z.number().int().optional(),
  type: ligneTypeEnum.optional(),
  remise: z.number().min(0).max(100).default(0),
});

/*
 * Bornes alignées sur les tables `factures`/`factures_lignes` (defense-in-depth). ⚠️ Le client NE
 * fournit PAS `numero` (généré serveur), `statut` (workflow), totaux ni `montantPaye` (dérivés/
 * paiement) → intégrité financière (numérotation maîtrisée + pas de total/paiement falsifiable).
 */
const createSchema = z.object({
  clientId: z.number().int(),
  devisId: z.number().int().nullish(),
  typeDocument: typeDocumentEnum.optional(),
  factureOrigineId: z.number().int().nullish(),
  objet: z.string().max(500).nullish(),
  referenceClient: z.string().max(100).nullish(),
  siretDestinataire: z.string().max(14).nullish(),
  conditionsPaiement: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  dateEcheance: isoDate.nullish(),
  /** Lignes initiales — insérées dans la même transaction que le header (évite les headers orphelins). */
  lignes: z.array(ligneCreateSchema).max(500).optional(),
  regimeTVA: regimeTVAEnum.optional(),
});

/** ⚠️ clientId / devisId / numero / statut / typeDocument / totaux / montantPaye ABSENTS. */
const updateSchema = z.object({
  objet: z.string().max(500).nullish(),
  referenceClient: z.string().max(100).nullish(),
  siretDestinataire: z.string().max(14).nullish(),
  conditionsPaiement: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
  dateEcheance: isoDate.nullish(),
  regimeTVA: regimeTVAEnum.optional(),
});

const ligneUpdateSchema = z.object({
  designation: z.string().min(1).max(500).optional(),
  prixUnitaireHT: decimal.optional(),
  quantite: decimal.optional(),
  unite: z.string().max(20).optional(),
  tvaCategorieId: tvaCategorieEnum.optional(),
  reference: z.string().max(50).nullish(),
  description: z.string().max(5000).nullish(),
  ordre: z.number().int().optional(),
  type: ligneTypeEnum.optional(),
  remise: z.number().min(0).max(100).optional(),
});

/** Schéma d'avoir partagé par `creerAvoir` et son alias client `createAvoir` (même use-case). */
const avoirInputSchema = z.object({
  factureOrigineId: z.number().int(),
  objet: z.string().max(500).nullish(),
  notes: z.string().max(5000).nullish(),
  lignes: z
    .array(
      z.object({
        designation: z.string().min(1).max(500),
        quantite: decimal,
        prixUnitaireHT: decimal,
        tvaCategorieId: tvaCategorieEnum.optional(),
        unite: z.string().max(20).nullish(),
        description: z.string().max(5000).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

/*
 * Routeur tRPC du domaine factures. Transport mince : valide les inputs (zod), délègue aux
 * use-cases (scoping tenant + numérotation serveur + anti-IDOR-FK + immutabilité post-émission),
 * laisse remonter les Domain errors (NotFound→404, Validation→400, Conflict→409).
 */
export function createFacturesRouter(repo: IFactureRepository, devisReader: IDevisReader, compta: ComptaPort, mailing: FactureMailingDeps, push?: PushPort, outboxInTx?: (artisanId: number, factureId: number, tx: DbClient) => Promise<void>, db?: DbClient, stockRepo?: IStockRepository, storage?: StoragePort, attestationRepo?: IAttestationTvaRepository, lockDateReader?: { getLockDate(ctx: TenantContext): Promise<string | null> }, notifRepo?: INotificationRepository) {

  return router({
    list: protectedProcedure.query(({ ctx }) => listFactures(repo, ctx.tenant)),

    /** Détail enrichi (parité legacy : `{ ...facture, lignes, client }`) — consommé par FactureDetail. */
    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getFactureDetail(repo, mailing.clientReader, ctx.tenant, input.id, attestationRepo)),

    getLignes: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => listLignesFacture(repo, ctx.tenant, input.factureId)),

    /*
     * Avoirs émis sur une facture (parité client `trpc.factures.getAvoirsByFacture`). Lecture seule,
     * scopée tenant (→ [] hors tenant, comme le legacy).
     */
    getAvoirsByFacture: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => getAvoirsFacture(repo, ctx.tenant, input.factureId)),

    /** Journal d'audit d'une facture (parité client `trpc.factures.getAuditLog`). Lecture seule, scopée. */
    getAuditLog: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => getAuditLogFacture(repo, ctx.tenant, input.factureId)),

    create: facturesCreer
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        const lockDate = await lockDateReader?.getLockDate(ctx.tenant) ?? null;
        const { lignes: rawLignes, ...rest } = input;
        const lignes = rawLignes?.map(({ tvaCategorieId, remise: remiseNum, ...l }) => {
          const categorieId = tvaCategorieId ?? "FR_20";
          return { ...l, tauxTVA: TVA_CATEGORIES_MAP[categorieId].taux, tvaCategorieId: categorieId, remise: String(remiseNum ?? 0) };
        });
        return withOutbox(db, repo, async (r, tx) => {
          const result = await creerFacture(r, ctx.tenant, { ...rest, dateEcheance: toDate(rest.dateEcheance), lignes }, undefined, lockDate);
          ctx.log.info({ event: "facture_created", factureId: result.id, clientId: rest.clientId }, "Facture créée");
          push?.sendToUser(ctx.tenant.artisanId, { title: "Operioz", body: `Nouvelle facture créée (brouillon)` }).catch(() => undefined);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "facture.creee", entityType: "facture", entityId: result.id, payload: { clientId: rest.clientId, numero: result.numero ?? null } });
          return result;
        });
      }),

    update: facturesCreer
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(async ({ ctx, input }) => {
        const lockDate = await lockDateReader?.getLockDate(ctx.tenant) ?? null;
        const { id, dateEcheance, ...data } = input;
        return modifierFacture(repo, ctx.tenant, id, { ...data, dateEcheance: toDate(dateEcheance) }, lockDate);
      }),

    delete: facturesSupprimer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerFacture(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    addLigne: facturesCreer
      .input(z.object({ factureId: z.number().int() }).and(ligneCreateSchema))
      .mutation(({ ctx, input }) => {
        const { factureId, tvaCategorieId, remise: remiseNum, ...data } = input;
        const effectiveCategorieId = ctx.tenant.franchiseTVA && (!tvaCategorieId || tvaCategorieId === "FR_20") ? "FR_FRANCHISE" : (tvaCategorieId ?? "FR_20");
        const tauxTVA = TVA_CATEGORIES_MAP[effectiveCategorieId].taux;
        return ajouterLigneFacture(repo, ctx.tenant, factureId, { ...data, tauxTVA, tvaCategorieId: effectiveCategorieId, remise: String(remiseNum ?? 0) });
      }),

    updateLigne: facturesCreer
      .input(z.object({ id: z.number().int(), factureId: z.number().int() }).and(ligneUpdateSchema))
      .mutation(({ ctx, input }) => {
        const { id, factureId, tvaCategorieId, remise: remiseNum, ...data } = input;
        const tauxTVA = tvaCategorieId ? TVA_CATEGORIES_MAP[tvaCategorieId].taux : undefined;
        return modifierLigneFacture(repo, ctx.tenant, factureId, id, { ...data, ...(tauxTVA !== undefined && { tauxTVA }), ...(tvaCategorieId !== undefined && { tvaCategorieId }), ...(remiseNum !== undefined && { remise: String(remiseNum) }) });
      }),

    deleteLigne: facturesCreer
      .input(z.object({ id: z.number().int(), factureId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerLigneFacture(repo, ctx.tenant, input.factureId, input.id);
        return { success: true };
      }),

    /*
     * Transitions de statut (machine à états dans le use-case : Conflict→409 si invalide).
     * ⚠️ Le passage à `payee` se fait via le paiement (étape ultérieure), pas ici.
     */
    envoyer: facturesCreer
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await changerStatutFacture(r, ctx.tenant, input.id, "envoyee", compta, mailing.artisanReader, outboxInTx, stockRepo);
          ctx.log.info({ event: "facture_envoyee", factureId: input.id }, "Facture envoyée au client");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "facture.envoyee", entityType: "facture", entityId: input.id, payload: {} });
          if (storage && db && !result.pdfFileId) {
            try {
              const [lignes, artisan, client] = await Promise.all([
                r.listLignes(ctx.tenant, result.id),
                mailing.artisanReader.getArtisan(ctx.tenant),
                mailing.clientReader.getClient(ctx.tenant, result.clientId),
              ]);
              if (artisan && client) {
                const pdfBuf = await mailing.pdf.render("facture", { facture: { ...result, lignes }, artisan, client });
                const s3Key = `factures/${ctx.tenant.artisanId}/${result.id}.pdf`;
                const stored = await storage.withDb(db).upload(s3Key, pdfBuf, { contentType: "application/pdf", artisanId: ctx.tenant.artisanId, filename: `Facture_${result.numero ?? result.id}.pdf`, purpose: "facture-pdf" }, ctx.tenant);
                await r.setPdfFile(ctx.tenant, result.id, stored.id, stored.storageKey);
              }
            } catch (_) { /* best-effort — PDF régénéré à la demande si l'upload échoue */ }
          }
          return result;
        });
      }),

    marquerEnRetard: facturesCreer
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => changerStatutFacture(repo, ctx.tenant, input.id, "en_retard")),

    /** Convertir un devis accepté en facture (cross-domaine : lit le devis via le reader injecté). */
    convertirDepuisDevis: facturesCreer
      .input(z.object({ devisId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await convertirDevisEnFacture(repo, devisReader, ctx.tenant, input.devisId);
        ctx.log.info({ event: "facture_depuis_devis", factureId: result.id, devisId: input.devisId }, "Devis converti en facture");
        return result;
      }),

    /** Créer une facture d'acompte (estAcompte=true) depuis un devis accepté (montant fixe TTC). */
    facturerAcompte: facturesCreer
      .input(z.object({
        devisId: z.number().int(),
        montant: decimal,
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await facturerAcompte(repo, devisReader, ctx.tenant, input);
        ctx.log.info({ event: "acompte_facture", factureId: result.id, devisId: input.devisId, montant: input.montant }, "Facture d'acompte créée");
        return result;
      }),

    /** Créer la facture de solde (lignes devis + déductions acomptes) depuis un devis accepté. */
    facturerSolde: facturesCreer
      .input(z.object({ devisId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const result = await facturerSolde(repo, devisReader, ctx.tenant, input);
        ctx.log.info({ event: "solde_facture", factureId: result.id, devisId: input.devisId }, "Facture de solde créée");
        return result;
      }),

    /** Facturer une situation de travaux sur un devis accepté (avancement partiel). */
    facturerSituation: facturesCreer
      .input(z.object({
        devisId: z.number().int(),
        pourcentageCumule: z.number().min(0.01).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await facturerSituation(repo, devisReader, ctx.tenant, input);
        ctx.log.info({ event: "situation_facturee", factureId: result.id, devisId: input.devisId, pourcentage: input.pourcentageCumule }, "Situation de travaux facturée");
        return result;
      }),

    /** Émettre un avoir (note de crédit) sur une facture d'origine — montants négatifs. */
    creerAvoir: facturesCreer.input(avoirInputSchema).mutation(({ ctx, input }) => {
      const { factureOrigineId, ...data } = input;
      return creerAvoir(repo, ctx.tenant, factureOrigineId, data, compta);
    }),

    /** Alias de surface (parité client `trpc.factures.createAvoir`) : même use-case que `creerAvoir`. */
    createAvoir: facturesCreer.input(avoirInputSchema).mutation(({ ctx, input }) => {
      const { factureOrigineId, ...data } = input;
      return creerAvoir(repo, ctx.tenant, factureOrigineId, data, compta);
    }),

    /** Enregistrement d'un paiement (partiel ou soldant) — passe `payee` si soldée. */
    enregistrerPaiement: facturesCreer
      .input(z.object({ id: z.number().int(), montant: decimal, date: isoDate.optional(), mode: z.string().max(50).optional() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await enregistrerPaiementFacture(r, ctx.tenant, input.id, { montant: input.montant, date: toDate(input.date), mode: input.mode ?? null }, compta, notifRepo);
          ctx.log.info({ event: "facture_paiement_enregistre", factureId: input.id, montant: Number(input.montant), mode: input.mode ?? null }, "Paiement facture enregistré");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "facture.paiement_enregistre", entityType: "facture", entityId: input.id, payload: { montant: input.montant, mode: input.mode ?? null } });
          return result;
        });
      }),

    /*
     * Paiement partiel ou soldant (parité client `trpc.factures.markAsPaid`) : cumule montantPaye,
     * marque `payee` uniquement si totalTTC soldé, génère les écritures FEC. Date invalide → 400.
     */
    markAsPaid: facturesCreer
      .input(z.object({ id: z.number().int(), montantPaye: decimal, datePaiement: isoDate }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const result = await enregistrerPaiementFacture(r, ctx.tenant, input.id, { montant: input.montantPaye, date: toDate(input.datePaiement) }, compta, notifRepo);
          ctx.log.info({ event: "facture_paiement_enregistre", factureId: input.id, montant: Number(input.montantPaye) }, "Paiement facture enregistré");
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "facture.paiement_enregistre", entityType: "facture", entityId: input.id, payload: { montant: input.montantPaye } });
          return result;
        });
      }),

    ajouterReglement: facturesCreer
      .input(z.object({
        factureId: z.number().int(),
        montant: decimal,
        date: isoDate,
        mode: z.enum(["cheque", "virement", "especes", "carte", "autre"]),
        reference: z.string().max(100).optional(),
        note: z.string().max(5000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await ajouterReglement(repo, ctx.tenant, {
          factureId: input.factureId,
          montant: input.montant,
          date: toDate(input.date) as Date,
          mode: input.mode,
          reference: input.reference ?? null,
          note: input.note ?? null,
        });
        ctx.log.info({ event: "reglement_ajoute", factureId: input.factureId, montant: Number(input.montant), mode: input.mode }, "Reglement ajouté");
        return result;
      }),

    /*
     * Envoi de la facture par email (PDF en pièce jointe) — parité client `trpc.factures.sendByEmail`.
     * ownership 404 / client.email 400 / rate-limit 429 ; passe `envoyee` si brouillon/validee (sans FEC).
     */
    sendByEmail: facturesCreer
      .input(
        z.object({
          factureId: z.number().int(),
          customMessage: z.string().max(5000).optional(),
          attachPdf: z.boolean().optional().default(true),
          pieceJointeIds: z.array(z.number().int()).max(10).optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        envoyerFactureParEmail(repo, mailing, ctx.tenant, {
          factureId: input.factureId,
          customMessage: input.customMessage,
          attachPdf: input.attachPdf,
          pieceJointeIds: input.pieceJointeIds,
        }),
      ),

    attestationTva: router({
      getByFacture: protectedProcedure
        .input(z.object({ factureId: z.number().int() }))
        .query(({ ctx, input }) => {
          if (!attestationRepo) return [];
          return attestationRepo.listByFacture(ctx.tenant, input.factureId);
        }),

      getByDevis: protectedProcedure
        .input(z.object({ devisId: z.number().int() }))
        .query(({ ctx, input }) => {
          if (!attestationRepo) return [];
          return attestationRepo.listByDevis(ctx.tenant, input.devisId);
        }),

      /** Génère le PDF d'attestation TVA réduite et le stocke. Renvoie l'URL publique. */
      generer: facturesCreer
        .input(
          z.object({
            factureId: z.number().int().optional(),
            devisId: z.number().int().optional(),
          }).refine((v) => v.factureId !== undefined || v.devisId !== undefined, {
            message: "factureId ou devisId requis",
          }),
        )
        .mutation(async ({ ctx, input }) => {
          if (!attestationRepo || !storage || !db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stockage non configuré" });

          /** Récupère les infos nécessaires depuis la facture ou le devis */
          let documentRef: string | null = null;
          let objetTravaux: string | null = null;
          let dateDocument: Date | null = null;
          let tauxTVA: number = 10;
          let clientId: number | null = null;

          if (input.factureId) {
            const facture = await repo.getById(ctx.tenant, input.factureId);
            if (!facture) throw new TRPCError({ code: "NOT_FOUND", message: "Facture introuvable" });
            const lignes = await repo.listLignes(ctx.tenant, input.factureId);
            if (!necessite_attestation_tva_reduite(lignes)) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune ligne à taux TVA réduit" });
            const tauxLigne = lignes.find((l) => { const t = Number(l.tauxTVA); return t === 10 || t === 5.5; });
            documentRef = facture.numero ?? `Facture #${facture.id}`;
            objetTravaux = facture.objet;
            dateDocument = facture.dateFacture;
            tauxTVA = tauxLigne ? Number(tauxLigne.tauxTVA) : 10;
            clientId = facture.clientId;
          } else if (input.devisId) {
            const devis = await devisReader.getDevis(ctx.tenant, input.devisId);
            if (!devis) throw new TRPCError({ code: "NOT_FOUND", message: "Devis introuvable" });
            const lignes = await devisReader.getLignes(ctx.tenant, input.devisId);
            if (!necessite_attestation_tva_reduite(lignes)) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune ligne à taux TVA réduit" });
            const tauxLigne = lignes.find((l) => { const t = Number(l.tauxTVA); return t === 10 || t === 5.5; });
            documentRef = devis.numero ?? `Devis #${devis.id}`;
            objetTravaux = devis.objet;
            dateDocument = null;
            tauxTVA = tauxLigne ? Number(tauxLigne.tauxTVA) : 10;
            clientId = devis.clientId;
          }

          const [artisan, client] = await Promise.all([
            mailing.artisanReader.getArtisan(ctx.tenant),
            clientId !== null ? mailing.clientReader.getClient(ctx.tenant, clientId) : Promise.resolve(null),
          ]);

          const pdfBuffer = generateAttestationTvaPDF({ documentRef, dateDocument, objetTravaux, tauxTVA, artisan, client });
          const s3Key = `attestations-tva/${ctx.tenant.artisanId}/${Date.now()}.pdf`;
          const stored = await storage.withDb(db).upload(s3Key, pdfBuffer, {
            contentType: "application/pdf",
            artisanId: ctx.tenant.artisanId,
            filename: `attestation-tva-${documentRef ?? "doc"}.pdf`,
            purpose: "attestation-tva",
          }, ctx.tenant);

          const attestation = await attestationRepo.create(ctx.tenant, {
            artisanId: ctx.tenant.artisanId,
            factureId: input.factureId ?? null,
            devisId: input.devisId ?? null,
            s3Key: stored.storageKey,
          });

          return attestation;
        }),

      /** Attache un PDF signé (base64) à une attestation existante. */
      attacherSignee: facturesCreer
        .input(z.object({ id: z.number().int(), fichierBase64: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
          if (!attestationRepo || !storage || !db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stockage non configuré" });

          const pdfBuffer = Buffer.from(input.fichierBase64, "base64");
          const s3Key = `attestations-tva/${ctx.tenant.artisanId}/signed-${input.id}-${Date.now()}.pdf`;
          const stored = await storage.withDb(db).upload(s3Key, pdfBuffer, {
            contentType: "application/pdf",
            artisanId: ctx.tenant.artisanId,
            filename: `attestation-tva-signee-${input.id}.pdf`,
            purpose: "attestation-tva-signee",
          }, ctx.tenant);

          const updated = await attestationRepo.attacherSignee(ctx.tenant, input.id, stored.storageKey);
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Attestation introuvable" });
          return updated;
        }),
    }),
  });
}
