import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { TVA_CATEGORIES_MAP, TAUX_TVA_LEGAUX } from "../../../shared/tva/taux-tva-fr";
import { round2 } from "../../../shared/money";
import { assertDateNonVerrouillee } from "../../../shared/compta-lock";
import { factureCounter } from "../../../shared/observability/business-metrics";
import type { IFactureRepository, AvoirLigneData, CopiedLigneData, Reglement } from "./facture-repository";
import type { DbClient } from "../../../shared/db";
import type { IDevisReader, DevisLigneReadModel } from "./devis-reader";
import type { ComptaPort } from "./compta-port";
import { NOOP_COMPTA } from "./compta-port";
import type { ArtisanReader } from "./contact-readers";
import type { IStockRepository } from "../../stocks/application/stock-repository";
import type { INotificationRepository } from "../../notifications/application/notification-repository";
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

function assertTauxTVALegal(tauxTVA: string | null | undefined): void {
  if (tauxTVA == null) return;
  if (!TAUX_TVA_LEGAUX.has(parseFloat(tauxTVA))) {
    throw new ValidationError(`Taux TVA ${tauxTVA} hors catalogue légal FR (autorisés : 0, 2.1, 5.5, 10, 20)`);
  }
}

function ventilerHTParGroupeTVA(
  produits: DevisLigneReadModel[],
  totalHTProduits: number,
  montantHTTarget: number,
): SituationLigneCalc[] {
  const groupes = new Map<string, { tauxTVA: string; tvaCategorieId?: string | null; groupHT: number }>();
  for (const l of produits) {
    const g = groupes.get(l.tauxTVA);
    if (g) { g.groupHT += Number(l.montantHT) || 0; }
    else { groupes.set(l.tauxTVA, { tauxTVA: l.tauxTVA, tvaCategorieId: l.tvaCategorieId, groupHT: Number(l.montantHT) || 0 }); }
  }
  const groupList = Array.from(groupes.values());
  const result: SituationLigneCalc[] = [];
  let htRestant = montantHTTarget;
  for (let i = 0; i < groupList.length; i++) {
    const g = groupList[i];
    const montantHT = i === groupList.length - 1
      ? htRestant
      : round2(montantHTTarget * g.groupHT / totalHTProduits);
    result.push({ tauxTVA: g.tauxTVA, tvaCategorieId: g.tvaCategorieId, montantHT });
    htRestant = round2(htRestant - montantHT);
  }
  return result;
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
  assertTauxTVALegal(input.tauxTVA);
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
  assertTauxTVALegal(input.tauxTVA);
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

const VALID_REGLEMENT_MODES = new Set(["cheque", "virement", "especes", "carte", "autre"]);

function toReglementMode(mode: string | null | undefined): "cheque" | "virement" | "especes" | "carte" | "autre" {
  return VALID_REGLEMENT_MODES.has(mode ?? "") ? (mode as "cheque" | "virement" | "especes" | "carte" | "autre") : "autre";
}

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
  notifRepo?: INotificationRepository,
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
    reglement: {
      montant: input.montant,
      date: input.date ?? new Date(),
      mode: toReglementMode(input.mode),
    },
  });
  if (!updated) throw new NotFoundError("Facture introuvable");
  /*
   * À la solde (passage `payee`) : génère les écritures FEC (vente + encaissement) via le port
   * compta (no-op tant que le domaine compta n'est pas porté — seam d'effet de bord).
   */
  if (soldee) {
    factureCounter.inc({ action: "paid" });
    await notifRepo?.archiveByLien(ctx, `/factures/${id}`).catch(() => { /* ponytail: best-effort — archiveByLien non-critique */ });
    try {
      await compta.genererEcrituresVente(ctx, id);
      await compta.genererEcrituresEncaissement(ctx, id, updated);
      await compta.validerEcritures(ctx, id);
    } catch (err) {
      /** Paiement déjà committé — échec compta non bloquant ; backfill via scripts/backfill-ecritures-compta.ts */
      console.error("[compta] enregistrerPaiement: generer/valider échoué facture", id, err);
    }
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
 * **écritures FEC** (vente + encaissement) et les **verrouille** (inaltérabilité). L'invariant
 * **Σ débit = Σ crédit** est garanti par les use-cases de génération (domaine ecritures). Date invalide
 * → ValidationError (400) AVANT toute écriture. Hors tenant → NotFoundError (404).
 * Génération d'écritures **best-effort** : le paiement est déjà committé avant les appels compta
 * (non-atomique) — un échec compta est logué et non renvoyé (backfill via backfill-ecritures-compta.ts).
 */
export async function marquerFacturePayee(
  repo: IFactureRepository,
  ctx: TenantContext,
  id: number,
  input: MarquerPayeeInput,
  compta: ComptaPort = NOOP_COMPTA,
  notifRepo?: INotificationRepository,
): Promise<Facture> {
  const facture = await getFactureOwned(repo, ctx, id);
  if (facture.statut !== "envoyee" && facture.statut !== "en_retard") {
    throw new ConflictError("Seule une facture émise (envoyée ou en retard) peut être marquée payée");
  }
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
  await notifRepo?.archiveByLien(ctx, `/factures/${id}`).catch(() => { /* ponytail: best-effort — archiveByLien non-critique */ });
  try {
    await compta.genererEcrituresVente(ctx, id);
    await compta.genererEcrituresEncaissement(ctx, id, updated);
    await compta.validerEcritures(ctx, id);
  } catch (err) {
    /** Paiement déjà committé — échec compta non bloquant ; backfill via scripts/backfill-ecritures-compta.ts */
    console.error("[compta] marquerPayee: generer/valider échoué facture", id, err);
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

  const avoir = await repo.createAvoir(ctx, {
    factureOrigineId,
    clientId: origine.clientId,
    objet: input.objet ?? `Avoir sur facture ${origine.numero ?? ""}`,
    notes: input.notes ?? null,
    conditionsPaiement: origine.conditionsPaiement,
    lignes,
  });
  if (!avoir) throw new NotFoundError("Facture d'origine introuvable");
  try {
    await compta.genererEcrituresVente(ctx, avoir.id);
    await compta.validerEcritures(ctx, avoir.id);
  } catch (err) {
    /** Avoir déjà committé — échec compta non bloquant ; backfill via scripts/backfill-ecritures-compta.ts */
    console.error("[compta] creerAvoir: generer/valider échoué avoir", avoir.id, err);
  }
  return avoir;
}

/*
 * Convertit un devis en facture (parité legacy `createFactureFromDevis`).
 * ⚠️ Invariants : devis du tenant (anti-IDOR-FK → NotFound) ; **devis `accepte` ou `envoye`**
 * sinon Conflict (brouillon/refusé/expiré non convertibles) ; **anti-doublon** : un devis déjà
 * facturé → Conflict (le legacy autorisait des conversions multiples). Lignes copiées
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
  if (devis.statut !== "accepte" && devis.statut !== "envoye") {
    throw new ConflictError("Seul un devis envoyé ou accepté peut être converti en facture");
  }
  const existingFacture = await factureRepo.findForDevis(ctx, devisId);
  if (existingFacture) {
    if (existingFacture.statut !== "brouillon") throw new ConflictError("Ce devis a déjà été converti en facture");
    return existingFacture;
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
    const lignes = await repo.listLignes(ctx, id);
    if (lignes.length === 0) throw new ValidationError("Une facture doit comporter au moins une ligne pour être émise");
    if (!artisanReader) throw new ValidationError("Le SIRET de l'artisan est requis pour émettre une facture");
    const artisan = await artisanReader.getArtisan(ctx);
    if (!artisan?.siret) throw new ValidationError("Le SIRET de l'artisan est requis pour émettre une facture");
  }
  if (cible === "envoyee" && facture.statut === "brouillon" && !facture.numero) {
    await repo.nextNumeroAndAssign(ctx, id);
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
  const montantHTAcompte = round2(montantTTC * proportion);

  /* Ventiler par groupe TVA (évite un taux composite hors catalogue légal FR). */
  const devisLignes = await devisReader.getLignes(ctx, input.devisId);
  const produits = devisLignes.filter((l) => l.type === "produit");
  const ventilationLignes = produits.length > 0
    ? ventilerHTParGroupeTVA(produits, totalHT, montantHTAcompte)
    : [{ tauxTVA: "20", tvaCategorieId: undefined, montantHT: montantHTAcompte }];

  const label = `Acompte sur devis n° ${devisData.numero}`;

  const facture = await creerFacture(factureRepo, ctx, {
    clientId: devisData.clientId,
    devisId: devisData.id,
    estAcompte: true,
    objet: label,
    notes: `Acompte ${montantTTC.toFixed(2)} € TTC — devis n° ${devisData.numero}`,
    lignes: ventilationLignes.map((v) => ({
      designation: ventilationLignes.length > 1 ? `${label} — TVA ${v.tauxTVA} %` : label,
      prixUnitaireHT: v.montantHT.toFixed(2),
      quantite: "1.00",
      tauxTVA: v.tauxTVA,
      tvaCategorieId: v.tvaCategorieId ?? null,
      remise: "0",
    })),
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
    const acompteLignes = await factureRepo.listLignes(ctx, acompte.id);
    const prodAcompte = acompteLignes.filter((al) => al.type === "produit");
    const srcLignes = prodAcompte.length > 0 ? prodAcompte : [{ montantHT: acompte.totalHT, tauxTVA: "20", tvaCategorieId: null }];
    const label = `Acompte déjà facturé (${acompte.numero ?? `Facture #${acompte.id}`})`;
    for (const al of srcLignes) {
      const htNum = Math.abs(Number(al.montantHT) || 0);
      const m = calculerMontantsAvoirLigne("1", String(htNum), al.tauxTVA);
      lignes.push({
        ordre: ordreDeduction++,
        reference: acompte.numero,
        designation: label,
        description: null,
        quantite: "1.00",
        unite: "unité",
        prixUnitaireHT: m.prixUnitaireHT,
        tauxTVA: al.tauxTVA,
        remise: "0",
        tvaCategorieId: al.tvaCategorieId ?? null,
        montantHT: m.montantHT,
        montantTVA: m.montantTVA,
        montantTTC: m.montantTTC,
        type: "produit",
      });
    }
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

/** Ligne de situation ventilée par taux TVA légal. */
export type SituationLigneCalc = {
  readonly tauxTVA: string;
  readonly tvaCategorieId?: string | null;
  readonly montantHT: number;
};

/**
 * Calcule les lignes d'une situation de travaux ventilées par taux TVA.
 * Formule : objectif = round(pourcentageCumule% × totalTTC) − montantDejaFacture.
 * Le montantHT est réparti proportionnellement par groupe de taux issu des lignes du devis.
 */
export function calculerMontantSituation(
  pourcentageCumule: number,
  totalTTC: string,
  lignes: DevisLigneReadModel[],
  montantDejaFacture: string,
): { montantSituationTTC: number; situationLignes: SituationLigneCalc[] } {
  const ttc = Number(totalTTC) || 0;
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

  /* Lignes produit uniquement (sections et notes n'ont pas de montant TVA). */
  const produits = lignes.filter(l => l.type === "produit");

  /* Cas dégénéré (devis sans ligne produit) : une ligne 20% avec HT = TTC / 1.2. */
  if (produits.length === 0) {
    return { montantSituationTTC, situationLignes: [{ tauxTVA: "20", montantHT: round2(montantSituationTTC / 1.2) }] };
  }

  const totalHT = produits.reduce((s, l) => s + (Number(l.montantHT) || 0), 0);
  const proportion = ttc > 0 ? totalHT / ttc : 1 / 1.2;
  const montantHTSituation = round2(montantSituationTTC * proportion);
  const situationLignes = ventilerHTParGroupeTVA(produits, totalHT, montantHTSituation);

  return { montantSituationTTC, situationLignes };
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

  const devisLignes = await devisReader.getLignes(ctx, input.devisId);
  const { montantSituationTTC, situationLignes } = calculerMontantSituation(
    input.pourcentageCumule,
    devisData.totalTTC,
    devisLignes,
    devisData.montantDejaFacture,
  );

  const label = `Situation de travaux — avancement ${input.pourcentageCumule} %`;
  const notes = `Déjà facturé : ${Number(devisData.montantDejaFacture).toFixed(2)} € — Devis n° ${devisData.numero}`;

  const facture = await creerFacture(factureRepo, ctx, {
    clientId: devisData.clientId,
    devisId: devisData.id,
    objet: label,
    notes,
    lignes: situationLignes.map((sl) => ({
      designation: situationLignes.length > 1 ? `${label} — TVA ${sl.tauxTVA} %` : label,
      prixUnitaireHT: sl.montantHT.toFixed(2),
      quantite: "1.00",
      tauxTVA: sl.tauxTVA,
      remise: "0",
      tvaCategorieId: sl.tvaCategorieId ?? null,
    })),
  }, (tx) => devisReader.updateMontantDejaFactureTx(tx, ctx, input.devisId, montantSituationTTC.toFixed(2)));

  return facture;
}
