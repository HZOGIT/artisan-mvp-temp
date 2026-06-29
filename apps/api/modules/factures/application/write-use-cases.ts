import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { TVA_CATEGORIES_MAP } from "../../../shared/tva/taux-tva-fr";
import { round2 } from "../../../shared/money";
import { assertDateNonVerrouillee } from "../../../shared/compta-lock";
import { factureCounter } from "../../../shared/observability/business-metrics";
import type { IFactureRepository, AvoirLigneData, CopiedLigneData, Reglement } from "./facture-repository";
import type { DbClient } from "../../../shared/db";
import type { IDevisReader } from "./devis-reader";
import type { ComptaPort } from "./compta-port";
import { NOOP_COMPTA } from "./compta-port";
import type { ArtisanReader } from "./contact-readers";
import type { IStockRepository } from "../../stocks/application/stock-repository";
import { calculerMontantsAvoirLigne } from "./montants";
import type {
  Facture,
  FactureLigne,
  FactureStatut,
  CreateFactureInput,
  UpdateFactureInput,
  CreateFactureLigneInput,
  UpdateFactureLigneInput,
} from "../domain/facture";

/*
 * Use-cases d'écriture — purs, repository injecté. ⚠️ Domaine financier CRITIQUE (pièce légale) :
 *  - **numero généré côté serveur** (`nextNumero`, jamais fourni par le client) ;
 *  - **anti-IDOR-FK** : `clientId` (et `devisId` si fourni) DOIVENT appartenir au tenant ;
 *  - **totaux dérivés des lignes** côté repo (jamais fournis par le client) ;
 *  - **immutabilité post-émission** : seule une facture `brouillon` est éditable — toute facture
 *    `validee`/`envoyee`/`payee`/`en_retard`/`annulee` est un document fiscal **verrouillé**
 *    (parité legacy « Document fiscal verrouillé — émettez un avoir pour corriger ») → Conflict.
 */

/** Entrée de création : pas de numero (généré serveur). Lignes optionnelles pour insertion atomique. */
export type CreerFactureInput = Omit<CreateFactureInput, "numero"> & {
  readonly lignes?: readonly CreateFactureLigneInput[];
};

/** Seul le brouillon est modifiable ; tout autre statut = pièce verrouillée. */
function assertModifiable(facture: Facture): void {
  if (facture.statut !== "brouillon") {
    throw new ConflictError("Document fiscal verrouillé — modification interdite (émettez un avoir pour corriger)");
  }
}

async function getFactureOwned(repo: IFactureRepository, ctx: TenantContext, id: number): Promise<Facture> {
  const facture = await repo.getById(ctx, id);
  if (!facture) throw new NotFoundError("Facture introuvable");
  return facture;
}

function assertLigneValide(designation: string | undefined, prixUnitaireHT?: string, quantite?: string): void {
  if (designation !== undefined && !designation.trim()) throw new ValidationError("La désignation est requise");
  if (prixUnitaireHT !== undefined && (!Number.isFinite(Number(prixUnitaireHT)) || Number(prixUnitaireHT) < 0)) {
    throw new ValidationError("Le prix unitaire doit être un nombre positif");
  }
  if (quantite !== undefined && (!Number.isFinite(Number(quantite)) || Number(quantite) < 0)) {
    throw new ValidationError("La quantité doit être un nombre positif");
  }
}

export async function creerFacture(repo: IFactureRepository, ctx: TenantContext, input: CreerFactureInput, inTx?: (tx: DbClient) => Promise<void>, lockDate?: string | null): Promise<Facture> {
  assertDateNonVerrouillee(new Date(), lockDate ?? null);
  /** Anti-IDOR-FK : client (et devis lié) du tenant uniquement (ne révèle pas l'existence). */
  if (!(await repo.ownsClient(ctx, input.clientId))) throw new NotFoundError("Client introuvable");
  if (input.devisId != null && !(await repo.ownsDevis(ctx, input.devisId))) throw new NotFoundError("Devis introuvable");
  const { lignes, ...header } = input;
  const facture = lignes && lignes.length > 0
    ? await repo.createWithLignes(ctx, { ...header, numero: null }, lignes, inTx)
    : await repo.create(ctx, { ...header, numero: null });
  factureCounter.inc({ action: "created" });
  return facture;
}

export async function modifierFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateFactureInput,
  lockDate?: string | null,
): Promise<Facture> {
  const facture = await getFactureOwned(repo, ctx, id);
  assertModifiable(facture);
  assertDateNonVerrouillee(facture.dateFacture, lockDate ?? null);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Facture introuvable");
  return updated;
}

export async function supprimerFacture(repo: IFactureRepository, ctx: TenantContext, id: number): Promise<void> {
  const facture = await getFactureOwned(repo, ctx, id);
  /** Une facture émise ne se supprime pas (pièce légale) — on émet un avoir. */
  assertModifiable(facture);
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Facture introuvable");
}

export async function ajouterLigneFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  factureId: number,
  input: CreateFactureLigneInput,
): Promise<FactureLigne> {
  const facture = await getFactureOwned(repo, ctx, factureId);
  assertModifiable(facture);
  assertLigneValide(input.designation, input.prixUnitaireHT, input.quantite);
  const ligne = await repo.addLigne(ctx, factureId, input);
  if (!ligne) throw new NotFoundError("Facture introuvable");
  return ligne;
}

export async function modifierLigneFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  factureId: number,
  ligneId: number,
  input: UpdateFactureLigneInput,
): Promise<FactureLigne> {
  const facture = await getFactureOwned(repo, ctx, factureId);
  assertModifiable(facture);
  const lignes = await repo.listLignes(ctx, factureId);
  if (!lignes.some((l) => l.id === ligneId)) throw new NotFoundError("Ligne introuvable");
  assertLigneValide(input.designation, input.prixUnitaireHT, input.quantite);
  const updated = await repo.updateLigne(ctx, ligneId, input);
  if (!updated) throw new NotFoundError("Ligne introuvable");
  return updated;
}

/*
 * Machine à états légale des factures (parité legacy `facturesRouter.update`) :
 *  brouillon → envoyee ; envoyee → payee | en_retard ; en_retard → payee.
 *  `payee`/`annulee` sont **terminaux**. `validee` n'a aucune transition (statut hérité de
 *  l'enum, non utilisé par le flux legacy). ⚠️ Le passage à `payee` est piloté par le use-case
 *  de **paiement** (enregistre montantPaye/datePaiement) — pas par une transition « nue ».
 */
const TRANSITIONS: Record<FactureStatut, readonly FactureStatut[]> = {
  brouillon: ["envoyee"],
  envoyee: ["payee", "en_retard"],
  en_retard: ["payee"],
  payee: [],
  annulee: [],
  validee: [],
};

/*
 * Entrée d'enregistrement d'un paiement. `montant` = montant de CE paiement (cumulé au déjà
 * payé). `date`/`mode` optionnels.
 */
export type EnregistrerPaiementInput = { readonly montant: string; readonly date?: Date | null; readonly mode?: string | null };

/** tolérance de comparaison au centime */
const EPS = 0.005;

/*
 * Enregistre un paiement (partiel ou soldant). ⚠️ Invariants financiers :
 *  - la facture doit être émise (`envoyee`/`en_retard`) → sinon Conflict (pas de paiement d'un
 *    brouillon/annulée/déjà soldée) ;
 *  - montant > 0 ; **anti-sur-paiement** : montantPaye cumulé ≤ totalTTC → sinon Validation ;
 *  - passage à `payee` UNIQUEMENT si soldée (cumul == totalTTC) ; sinon le statut est conservé.
 *  ⚠️ Durcissement vs legacy `markAsPaid` (qui écrasait montantPaye et passait `payee`
 *  inconditionnellement, même partiel) — voir finding.
 */
export async function enregistrerPaiementFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  id: number,
  input: EnregistrerPaiementInput,
  compta: ComptaPort = NOOP_COMPTA,
): Promise<Facture> {
  const facture = await getFactureOwned(repo, ctx, id);
  if (facture.statut !== "envoyee" && facture.statut !== "en_retard") {
    throw new ConflictError("Seule une facture émise (envoyée ou en retard) peut recevoir un paiement");
  }
  const montant = Number(input.montant);
  if (!Number.isFinite(montant) || montant <= 0) throw new ValidationError("Le montant du paiement doit être strictement positif");
  const total = Number(facture.totalTTC) || 0;
  const cumul = (Number(facture.montantPaye) || 0) + montant;
  if (cumul > total + EPS) throw new ValidationError("Le montant payé dépasse le total TTC de la facture (sur-paiement)");
  const soldee = total > 0 && cumul >= total - EPS;
  const updated = await repo.enregistrerPaiement(ctx, id, {
    montantPaye: round2(cumul).toFixed(2),
    datePaiement: input.date ?? (soldee ? new Date() : facture.datePaiement),
    modePaiement: input.mode ?? facture.modePaiement,
    statut: soldee ? "payee" : facture.statut,
  });
  if (!updated) throw new NotFoundError("Facture introuvable");
  /*
   * À la solde (passage `payee`) : génère les écritures FEC (vente + encaissement) via le port
   * compta (no-op tant que le domaine compta n'est pas porté — seam d'effet de bord).
   */
  if (soldee) {
    factureCounter.inc({ action: "paid" });
    await compta.genererEcrituresVente(ctx, id);
    await compta.genererEcrituresEncaissement(ctx, id, updated);
  }
  return updated;
}

/*
 * Entrée de `marquerFacturePayee` (parité legacy `markAsPaid`). `montantPaye` = montant **absolu**
 * (écrasé, PAS cumulé — sémantique legacy) ; `datePaiement` = ISO string (validée ici).
 */
export type MarquerPayeeInput = { readonly montantPaye: string; readonly datePaiement: string };

/*
 * Marque une facture comme **payée** (parité legacy `markAsPaid`). ⚠️ Sémantique LEGACY (différente de
 * `enregistrerPaiementFacture`) : **écrase** `montantPaye`, force `statut=payee` (la facture émise est
 * soldée par cette action — le client n'appelle markAsPaid que sur une facture émise), puis génère les
 * **écritures FEC** (vente + encaissement) via le `ComptaPort`. L'invariant **Σ débit = Σ crédit** est
 * garanti par les use-cases de génération (domaine ecritures). Date invalide → ValidationError (400) AVANT
 * toute écriture (parité legacy : pas d'écriture sur une date NaN). Hors tenant → NotFoundError (404).
 * Génération d'écritures **best-effort** (try/catch — un échec compta ne casse pas le paiement, parité legacy).
 */
export async function marquerFacturePayee(
  repo: IFactureRepository,
  ctx: TenantContext,
  id: number,
  input: MarquerPayeeInput,
  compta: ComptaPort = NOOP_COMPTA,
): Promise<Facture> {
  const facture = await getFactureOwned(repo, ctx, id);
  const datePaiement = new Date(input.datePaiement);
  if (Number.isNaN(datePaiement.getTime())) throw new ValidationError("Date de paiement invalide");
  const updated = await repo.enregistrerPaiement(ctx, id, {
    /** écrasé (sémantique legacy, non cumulatif) */
    montantPaye: input.montantPaye,
    datePaiement,
    /** préservé */
    modePaiement: facture.modePaiement,
    statut: "payee",
  });
  if (!updated) throw new NotFoundError("Facture introuvable");
  factureCounter.inc({ action: "paid" });
  try {
    await compta.genererEcrituresVente(ctx, id);
    await compta.genererEcrituresEncaissement(ctx, id, updated);
  } catch {
    /** Échec de génération des écritures : ne casse pas le paiement (parité legacy try/catch). */
  }
  return updated;
}

/** Entrée pour ajouter un reglement */
export type AjouterReglementInput = {
  readonly factureId: number;
  readonly montant: string;
  readonly date: Date;
  readonly mode: "cheque" | "virement" | "especes" | "carte" | "autre";
  readonly reference?: string | null;
  readonly note?: string | null;
};

/*
 * Ajoute un reglement (paiement détaillé) à une facture. Recalcule montantPaye et met à jour
 * le statut en `payee` si la facture est entièrement payée. ⚠️ Invariants :
 *  - facture doit être émise (`envoyee`/`en_retard`) ;
 *  - montant > 0 et anti-sur-paiement (cumul ≤ totalTTC) ;
 *  - crée un enregistrement reglement + recalcule montantPaye de la facture.
 */
export async function ajouterReglement(
  repo: IFactureRepository,
  ctx: TenantContext,
  input: AjouterReglementInput,
): Promise<Reglement> {
  const facture = await getFactureOwned(repo, ctx, input.factureId);
  if (facture.statut !== "envoyee" && facture.statut !== "en_retard") {
    throw new ConflictError("Seule une facture émise (envoyée ou en retard) peut recevoir un paiement");
  }
  const montant = Number(input.montant);
  if (!Number.isFinite(montant) || montant <= 0) throw new ValidationError("Le montant du reglement doit être strictement positif");

  const reglement = await repo.ajouterReglement(ctx, {
    factureId: input.factureId,
    montant: montant.toFixed(2),
    date: input.date,
    mode: input.mode,
    reference: input.reference ?? null,
    note: input.note ?? null,
  });
  if (!reglement) throw new NotFoundError("Facture introuvable");

  return reglement;
}

/** Entrée de création d'un avoir (note de crédit) sur une facture d'origine. */
export type CreerAvoirInput = {
  readonly lignes: readonly {
    readonly designation: string;
    readonly quantite: string;
    readonly prixUnitaireHT: string;
    readonly tauxTVA?: string;
    readonly tvaCategorieId?: string;
    readonly unite?: string | null;
    readonly description?: string | null;
    readonly remise?: string;
  }[];
  readonly objet?: string | null;
  readonly notes?: string | null;
};

/*
 * Émet un avoir sur une facture d'origine (parité legacy `createAvoir`). ⚠️ Invariants :
 *  - la facture d'origine doit appartenir au tenant (anti-IDOR-FK) et **ne pas être brouillon**
 *    (on supprime/modifie un brouillon, on ne l'avoir pas) → Conflict ;
 *  - au moins une ligne valide ; montants de l'avoir **négatifs** (note de crédit) ;
 *  - **anti-sur-avoir** : le cumul des avoirs (déjà émis + nouveau, en valeur absolue) ne peut
 *    dépasser le total TTC de la facture d'origine → Validation/Conflict.
 */
export async function creerAvoir(
  repo: IFactureRepository,
  ctx: TenantContext,
  factureOrigineId: number,
  input: CreerAvoirInput,
  compta: ComptaPort = NOOP_COMPTA,
): Promise<Facture> {
  const origine = await getFactureOwned(repo, ctx, factureOrigineId);
  if (origine.statut === "brouillon") {
    throw new ConflictError("Impossible d'émettre un avoir sur un brouillon (modifiez ou supprimez le brouillon)");
  }
  if (!input.lignes.length) throw new ValidationError("Un avoir doit comporter au moins une ligne");

  /** Lignes d'avoir à montants négatifs. */
  const lignes: AvoirLigneData[] = input.lignes.map((l) => {
    assertLigneValide(l.designation, l.prixUnitaireHT, l.quantite);
    const categorieId = l.tvaCategorieId ?? null;
    const tauxTVA = categorieId ? (TVA_CATEGORIES_MAP[categorieId as keyof typeof TVA_CATEGORIES_MAP]?.taux ?? "20.00") : (l.tauxTVA ?? "20.00");
    const m = calculerMontantsAvoirLigne(l.quantite, l.prixUnitaireHT, tauxTVA, l.remise ?? "0");
    return {
      designation: l.designation,
      description: l.description ?? null,
      quantite: String(Math.abs(Number(l.quantite) || 0)),
      unite: l.unite ?? null,
      prixUnitaireHT: m.prixUnitaireHT,
      tauxTVA,
      tvaCategorieId: categorieId,
      montantHT: m.montantHT,
      montantTVA: m.montantTVA,
      montantTTC: m.montantTTC,
    };
  });

  /** Anti-sur-avoir : cumul des avoirs ≤ total TTC de la facture d'origine. */
  const factureTotal = Math.abs(Number(origine.totalTTC) || 0);
  const dejaCouvert = (await repo.listAvoirs(ctx, factureOrigineId)).reduce(
    (sum, a) => sum + Math.abs(Number(a.totalTTC) || 0),
    0,
  );
  const soldeRestant = factureTotal - dejaCouvert;
  if (soldeRestant <= 0.01) {
    throw new ConflictError("Le solde de cette facture est entièrement couvert par les avoirs existants");
  }
  const nouveauMontant = lignes.reduce((sum, l) => sum + Math.abs(Number(l.montantTTC) || 0), 0);
  if (nouveauMontant > soldeRestant + 0.01) {
    throw new ValidationError(`Le montant de l'avoir dépasse le solde disponible (${soldeRestant.toFixed(2)})`);
  }

  const numero = await repo.nextNumeroAvoir(ctx);
  const avoir = await repo.createAvoir(ctx, {
    factureOrigineId,
    clientId: origine.clientId,
    numero,
    objet: input.objet ?? `Avoir sur facture ${origine.numero ?? ""}`,
    notes: input.notes ?? null,
    conditionsPaiement: origine.conditionsPaiement,
    lignes,
  });
  if (!avoir) throw new NotFoundError("Facture d'origine introuvable");
  /*
   * L'avoir est émis (`validee`) : on génère immédiatement ses écritures de vente (journal VE,
   * TVA INVERSÉE — `genererEcrituresVente` gère `isAvoir`) pour que la note de crédit RÉDUISE la
   * TVA collectée / le grand livre / la balance. Idempotent (purge+réinsertion). Best-effort : un
   * échec d'écriture ne casse pas l'émission du document avoir.
   */
  try {
    await compta.genererEcrituresVente(ctx, avoir.id);
  } catch {
    /** écritures non bloquantes pour le document (cohérent avec les autres flux compta best-effort) */
  }
  return avoir;
}

/*
 * Convertit un devis ACCEPTÉ en facture (parité legacy `createFactureFromDevis`, **durci**).
 * ⚠️ Invariants : devis du tenant (anti-IDOR-FK → NotFound) ; **devis `accepte`** sinon Conflict
 * (on ne facture qu'un devis accepté — le legacy ne le vérifiait pas) ; **anti-doublon** : un
 * devis déjà facturé → Conflict (le legacy autorisait des conversions multiples). Lignes copiées
 * (montants du devis), totaux recalculés des lignes côté infra, statut facture `brouillon`.
 */
export async function convertirDevisEnFacture(
  factureRepo: IFactureRepository,
  devisReader: IDevisReader,
  ctx: TenantContext,
  devisId: number,
): Promise<Facture> {
  const devis = await devisReader.getDevis(ctx, devisId);
  if (!devis) throw new NotFoundError("Devis introuvable");
  if (devis.statut !== "accepte") {
    throw new ConflictError("Seul un devis accepté peut être converti en facture");
  }
  if (await factureRepo.existsForDevis(ctx, devisId)) {
    throw new ConflictError("Ce devis a déjà été converti en facture");
  }
  const lignesDevis = await devisReader.getLignes(ctx, devisId);
  const lignes: CopiedLigneData[] = lignesDevis.map((l) => ({
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
    type: l.type,
  }));
  const facture = await factureRepo.createFromDevis(ctx, {
    devisId: devis.id,
    clientId: devis.clientId,
    numero: null,
    objet: devis.objet,
    referenceClient: devis.referenceClient,
    conditionsPaiement: devis.conditionsPaiement,
    notes: devis.notes,
    lignes,
  });
  if (!facture) throw new NotFoundError("Client du devis introuvable");
  factureCounter.inc({ action: "created" });
  return facture;
}

export async function changerStatutFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  id: number,
  cible: FactureStatut,
  compta: ComptaPort = NOOP_COMPTA,
  artisanReader?: ArtisanReader,
  outboxInTx?: (artisanId: number, factureId: number, tx: DbClient) => Promise<void>,
  stockRepo?: IStockRepository,
): Promise<Facture> {
  const facture = await getFactureOwned(repo, ctx, id);
  /** idempotent */
  if (facture.statut === cible) return facture;
  if (!TRANSITIONS[facture.statut].includes(cible)) {
    throw new ConflictError(`Transition de statut invalide : ${facture.statut} → ${cible}`);
  }
  if (cible === "envoyee") {
    if (!artisanReader) throw new ValidationError("Le SIRET de l'artisan est requis pour émettre une facture");
    const artisan = await artisanReader.getArtisan(ctx);
    if (!artisan?.siret) throw new ValidationError("Le SIRET de l'artisan est requis pour émettre une facture");
  }
  if (cible === "envoyee" && facture.statut === "brouillon" && !facture.numero) {
    const numero = await repo.nextNumero(ctx);
    await repo.assignNumero(ctx, id, numero);
  }
  /** Insert pa_outbox dans la même tx que setStatut → atomicité réglementaire. */
  const inTx = cible === "envoyee" && outboxInTx
    ? (tx: DbClient) => outboxInTx(ctx.artisanId, id, tx)
    : undefined;
  const updated = await repo.setStatut(ctx, id, cible, inTx);
  if (!updated) throw new NotFoundError("Facture introuvable");
  /** À l'émission (passage `envoyee`) : génère la pièce de vente FEC (411/706/445) + valide (verrouille) les écritures. Idempotent. */
  if (cible === "envoyee") {
    factureCounter.inc({ action: "emitted" });
    await compta.genererEcrituresVente(ctx, id);
    await compta.validerEcritures(ctx, id);
    if (stockRepo) {
      const lignes = await repo.listLignes(ctx, id);
      for (const ligne of lignes) {
        if (!ligne.articleId) continue;
        const stock = await stockRepo.findByArticleId(ctx, ligne.articleId);
        if (!stock) continue;
        /* ponytail: silencieux — insufficient_stock ou not_found = article non suivi en stock */
        await stockRepo.adjustQuantity(ctx, stock.id, {
          type: "sortie",
          quantite: ligne.quantite,
          motif: "Facturation automatique",
          reference: facture.numero ?? undefined,
        });
      }
    }
  }
  return updated;
}

/** Entrée pour créer une facture d'acompte depuis un devis accepté. */
export type FacturerAcompteInput = {
  readonly devisId: number;
  readonly montant: string;
};

/*
 * Crée une facture d'acompte (estAcompte=true) sur un devis accepté. ⚠️ Invariants :
 *  - devis du tenant, statut `accepte` ;
 *  - montant > 0 et cumul ≤ totalTTC devis (anti-dépassement) ;
 *  - aucune facture de solde déjà émise (existsForDevis=false) ;
 *  - met à jour montantDejaFacture atomiquement (même tx que la création).
 */
export async function facturerAcompte(
  factureRepo: IFactureRepository,
  devisReader: IDevisReader,
  ctx: TenantContext,
  input: FacturerAcompteInput,
): Promise<Facture> {
  const devisData = await devisReader.getDevis(ctx, input.devisId);
  if (!devisData) throw new NotFoundError("Devis introuvable");
  if (devisData.statut !== "accepte") {
    throw new ConflictError("Seul un devis accepté peut faire l'objet d'un acompte");
  }
  if (await factureRepo.existsForDevis(ctx, input.devisId)) {
    throw new ConflictError("Une facture de solde a déjà été émise pour ce devis");
  }

  const montantTTC = round2(Number(input.montant) || 0);
  if (!Number.isFinite(montantTTC) || montantTTC <= 0) {
    throw new ValidationError("Le montant de l'acompte doit être strictement positif");
  }

  const totalDevis = Number(devisData.totalTTC) || 0;
  const dejaFacture = Number(devisData.montantDejaFacture) || 0;
  const restant = round2(totalDevis - dejaFacture);
  if (montantTTC > restant + EPS) {
    throw new ValidationError(`Le montant de l'acompte dépasse le restant à facturer (${restant.toFixed(2)} €)`);
  }

  const totalHT = Number(devisData.totalHT) || 0;
  const proportion = totalDevis > 0 ? totalHT / totalDevis : 1 / 1.2;
  const montantHT = round2(montantTTC * proportion);
  const tauxTVA = totalHT > 0 && totalDevis > totalHT
    ? round2((totalDevis - totalHT) / totalHT * 100).toFixed(2)
    : "20.00";

  const label = `Acompte sur devis n° ${devisData.numero}`;

  const facture = await creerFacture(factureRepo, ctx, {
    clientId: devisData.clientId,
    devisId: devisData.id,
    estAcompte: true,
    objet: label,
    notes: `Acompte ${montantTTC.toFixed(2)} € TTC — devis n° ${devisData.numero}`,
    lignes: [{
      designation: label,
      prixUnitaireHT: montantHT.toFixed(2),
      quantite: "1.00",
      tauxTVA,
      remise: "0",
    }],
  }, (tx) => devisReader.updateMontantDejaFactureTx(tx, ctx, input.devisId, montantTTC.toFixed(2)));

  return facture;
}

/** Entrée pour créer la facture de solde depuis un devis avec acomptes. */
export type FacturerSoldeInput = {
  readonly devisId: number;
};

/*
 * Crée la facture de solde : copie les lignes du devis puis insère une ligne de déduction
 * négative par acompte. ⚠️ Invariants : devis `accepte`, pas de solde existant, TVA cohérente
 * (la déduction inverse la TVA de l'acompte → totalTTC solde = totalTTC devis − Σ(acomptes)).
 */
export async function facturerSolde(
  factureRepo: IFactureRepository,
  devisReader: IDevisReader,
  ctx: TenantContext,
  input: FacturerSoldeInput,
): Promise<Facture> {
  const devisData = await devisReader.getDevis(ctx, input.devisId);
  if (!devisData) throw new NotFoundError("Devis introuvable");
  if (devisData.statut !== "accepte") {
    throw new ConflictError("Seul un devis accepté peut être soldé");
  }
  if (await factureRepo.existsForDevis(ctx, input.devisId)) {
    throw new ConflictError("Une facture de solde a déjà été émise pour ce devis");
  }

  const acomptes = (await factureRepo.listAcomptes(ctx, input.devisId)).filter(
    (a) => a.statut !== "annulee",
  );

  const lignesDevis = await devisReader.getLignes(ctx, input.devisId);
  const lignes: CopiedLigneData[] = lignesDevis.map((l) => ({
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
    type: l.type,
  }));

  let ordreDeduction = lignes.length;
  for (const acompte of acomptes) {
    const htNum = Math.abs(Number(acompte.totalHT) || 0);
    const ttcNum = Math.abs(Number(acompte.totalTTC) || 0);
    const tauxTVA = htNum > 0 ? round2((ttcNum - htNum) / htNum * 100).toFixed(2) : "20.00";
    const m = calculerMontantsAvoirLigne("1", String(htNum), tauxTVA);
    lignes.push({
      ordre: ordreDeduction++,
      reference: acompte.numero,
      designation: `Acompte déjà facturé (${acompte.numero ?? `Facture #${acompte.id}`})`,
      description: null,
      quantite: "1.00",
      unite: "unité",
      prixUnitaireHT: m.prixUnitaireHT,
      tauxTVA,
      remise: "0",
      tvaCategorieId: null,
      montantHT: m.montantHT,
      montantTVA: m.montantTVA,
      montantTTC: m.montantTTC,
      type: "produit",
    });
  }

  const facture = await factureRepo.createFromDevis(ctx, {
    devisId: devisData.id,
    clientId: devisData.clientId,
    numero: null,
    objet: devisData.objet ? `Solde — ${devisData.objet}` : "Facture de solde",
    referenceClient: devisData.referenceClient,
    conditionsPaiement: devisData.conditionsPaiement,
    notes: acomptes.length > 0
      ? `Solde — ${acomptes.length} acompte(s) déduit(s). Devis n° ${devisData.numero}`
      : devisData.notes,
    lignes,
  });
  if (!facture) throw new NotFoundError("Client du devis introuvable");
  factureCounter.inc({ action: "created" });
  return facture;
}

export async function supprimerLigneFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  factureId: number,
  ligneId: number,
): Promise<void> {
  const facture = await getFactureOwned(repo, ctx, factureId);
  assertModifiable(facture);
  const lignes = await repo.listLignes(ctx, factureId);
  if (!lignes.some((l) => l.id === ligneId)) throw new NotFoundError("Ligne introuvable");
  const ok = await repo.deleteLigne(ctx, ligneId);
  if (!ok) throw new NotFoundError("Ligne introuvable");
}

/**
 * Calcule le montant TTC d'une situation de travaux (fonction pure, testable).
 * Formule : montantSituationTTC = round(pourcentageCumule% × totalTTC) − montantDejaFacture.
 * Retourne également le montantHT et le tauxTVA effectif (proportionnel au devis).
 */
export function calculerMontantSituation(
  pourcentageCumule: number,
  totalTTC: string,
  totalHT: string,
  montantDejaFacture: string,
): { montantSituationTTC: number; montantHT: number; tauxTVA: string } {
  const ttc = Number(totalTTC) || 0;
  const ht = Number(totalHT) || 0;
  const dejaFacture = Number(montantDejaFacture) || 0;

  if (pourcentageCumule <= 0 || pourcentageCumule > 100) {
    throw new ValidationError("Le pourcentage doit être compris entre 0 (exclus) et 100");
  }

  const objectif = round2(pourcentageCumule / 100 * ttc);
  const montantSituationTTC = round2(objectif - dejaFacture);

  if (montantSituationTTC <= 0) {
    throw new ValidationError("Le montant de la situation est nul ou négatif — ce pourcentage a déjà été facturé");
  }
  if (round2(dejaFacture + montantSituationTTC) > ttc + EPS) {
    throw new ValidationError("Cette situation dépasserait le montant total TTC du devis");
  }

  /** Proportion HT/TTC identique au devis (préserve la structure TVA). */
  const proportion = ttc > 0 ? ht / ttc : 1 / 1.2;
  const montantHT = round2(montantSituationTTC * proportion);
  const tauxTVA = ht > 0 && ttc > ht
    ? round2((ttc - ht) / ht * 100).toFixed(2)
    : "20.00";

  return { montantSituationTTC, montantHT, tauxTVA };
}

/** Entrée pour facturer une situation de travaux. */
export type FacturerSituationInput = {
  readonly devisId: number;
  readonly pourcentageCumule: number;
};

/*
 * Facture une situation de travaux sur un devis accepté. ⚠️ Money path :
 *  - devis du tenant (anti-IDOR-FK → NotFound) ;
 *  - devis `accepte` sinon Conflict ;
 *  - garde anti-dépassement : cumul des situations ≤ totalTTC → Validation ;
 *  - crée une facture brouillon (1 ligne de situation) + incrémente montantDejaFacture.
 */
export async function facturerSituation(
  factureRepo: IFactureRepository,
  devisReader: IDevisReader,
  ctx: TenantContext,
  input: FacturerSituationInput,
): Promise<Facture> {
  const devisData = await devisReader.getDevis(ctx, input.devisId);
  if (!devisData) throw new NotFoundError("Devis introuvable");
  if (devisData.statut !== "accepte") {
    throw new ConflictError("Seul un devis accepté peut être facturé par situation");
  }

  const { montantSituationTTC, montantHT, tauxTVA } = calculerMontantSituation(
    input.pourcentageCumule,
    devisData.totalTTC,
    devisData.totalHT,
    devisData.montantDejaFacture,
  );

  const label = `Situation de travaux — avancement ${input.pourcentageCumule} %`;
  const notes = `Déjà facturé : ${Number(devisData.montantDejaFacture).toFixed(2)} € — Devis n° ${devisData.numero}`;

  const facture = await creerFacture(factureRepo, ctx, {
    clientId: devisData.clientId,
    devisId: devisData.id,
    objet: label,
    notes,
    lignes: [{
      designation: label,
      prixUnitaireHT: montantHT.toFixed(2),
      quantite: "1.00",
      tauxTVA,
      remise: "0",
    }],
  }, (tx) => devisReader.updateMontantDejaFactureTx(tx, ctx, input.devisId, montantSituationTTC.toFixed(2)));

  return facture;
}
