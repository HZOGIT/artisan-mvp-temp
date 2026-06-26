import type { TenantContext } from "../../../shared/tenant";
import type { DbClient } from "../../../shared/db";
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

/*
 * Port du repository factures. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * `factures` possède un `artisanId` → double cloisonnement RLS + filtre. Les `factures_lignes`
 * (SANS artisanId) sont scopées via la facture parente du tenant. ⚠️ Domaine financier CRITIQUE :
 * totaux dérivés des lignes (jamais fournis par le client), numérotation serveur (`nextNumero`),
 * et les invariants sensibles (TVA dérivée, **immutabilité post-émission**, transitions de
 * statut, paiement, avoir, FEC) sont portés par les use-cases (étapes ultérieures), pas le CRUD.
 */
export interface IFactureRepository {
  list(ctx: TenantContext): Promise<Facture[]>;
  /** null si la facture n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<Facture | null>;
  create(ctx: TenantContext, input: CreateFactureInput): Promise<Facture>;
  /** Crée un header + lignes dans une seule transaction — évite un header orphelin si les inserts lignes échouent. */
  createWithLignes(ctx: TenantContext, header: CreateFactureInput, lignes: readonly CreateFactureLigneInput[]): Promise<Facture>;
  /** null si la facture n'appartient pas au tenant. */
  update(ctx: TenantContext, id: number, input: UpdateFactureInput): Promise<Facture | null>;
  /** false si la facture n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  /** Définit le statut (transition pilotée par le use-case workflow) — null hors tenant.
   *  `inTx` est exécuté dans la même transaction que l'UPDATE (atomicité outbox PA). */
  setStatut(ctx: TenantContext, id: number, statut: FactureStatut, inTx?: (tx: DbClient) => Promise<void>): Promise<Facture | null>;
  /*
   * Enregistre un paiement (écrit montantPaye cumulé + date/mode + statut calculés par le
   * use-case) — null hors tenant. Les invariants (montant > 0, anti-sur-paiement, statut
   * soldée) sont portés par le use-case ; le repo ne fait qu'écrire le patch scopé tenant.
   */
  enregistrerPaiement(ctx: TenantContext, id: number, patch: PaiementPatch): Promise<Facture | null>;
  /** Prochain numéro de facture, scopé tenant, généré serveur (parité `getNextFactureNumber`). */
  nextNumero(ctx: TenantContext): Promise<string>;
  /** Prochain numéro d'AVOIR (préfixe + compteur dédiés, parité `getNextAvoirNumber`). */
  nextNumeroAvoir(ctx: TenantContext): Promise<string>;
  /** Avoirs émis sur une facture d'origine (typeDocument='avoir'), scopés tenant. */
  listAvoirs(ctx: TenantContext, factureOrigineId: number): Promise<Facture[]>;
  /*
   * Journal d'audit d'une facture (table `audit_log`, scopé artisanId + entityType='facture'),
   * trié du plus récent au plus ancien. Lecture seule (parité legacy `getAuditLog`).
   */
  listAuditLog(ctx: TenantContext, factureId: number): Promise<AuditLogEntry[]>;
  /*
   * Crée un avoir (note de crédit) + ses lignes (montants négatifs déjà calculés) dans une
   * transaction — null si la facture d'origine n'appartient pas au tenant.
   */
  createAvoir(ctx: TenantContext, input: CreateAvoirInput): Promise<Facture | null>;
  /** true si le client référencé appartient au tenant (anti-IDOR-FK). */
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  /** true si le devis référencé appartient au tenant (anti-IDOR-FK sur le lien devis→facture). */
  ownsDevis(ctx: TenantContext, devisId: number): Promise<boolean>;
  /*
   * true s'il existe déjà une facture (typeDocument='facture') liée à ce devis (anti-doublon
   * de conversion), scopé tenant.
   */
  existsForDevis(ctx: TenantContext, devisId: number): Promise<boolean>;
  /*
   * Crée une facture à partir d'un devis (lignes copiées, totaux recalculés des lignes,
   * statut brouillon, devisId lié) — null si le devis n'appartient pas au tenant.
   */
  createFromDevis(ctx: TenantContext, input: CreateFromDevisInput): Promise<Facture | null>;

  /** Lignes d'une facture — [] si la facture n'appartient pas au tenant. */
  listLignes(ctx: TenantContext, factureId: number): Promise<FactureLigne[]>;
  /** Ajoute une ligne (montants recalculés) — null si la facture n'appartient pas au tenant. */
  addLigne(ctx: TenantContext, factureId: number, input: CreateFactureLigneInput): Promise<FactureLigne | null>;
  /** Modifie une ligne (montants recalculés) — null si la ligne ne relève pas d'une facture du tenant. */
  updateLigne(ctx: TenantContext, ligneId: number, input: UpdateFactureLigneInput): Promise<FactureLigne | null>;
  /** false si la ligne ne relève pas d'une facture du tenant. */
  deleteLigne(ctx: TenantContext, ligneId: number): Promise<boolean>;
}

/** Patch d'enregistrement de paiement (valeurs déjà calculées par le use-case). */
export interface PaiementPatch {
  readonly montantPaye: string;
  readonly datePaiement: Date | null;
  readonly modePaiement: string | null;
  readonly statut: FactureStatut;
}

/** Ligne d'avoir avec montants NÉGATIFS déjà calculés (par le use-case). */
export interface AvoirLigneData {
  readonly designation: string;
  readonly description: string | null;
  readonly quantite: string;
  readonly unite: string | null;
  /** négatif */
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly tvaCategorieId?: string | null;
  /** négatif */
  readonly montantHT: string;
  /** négatif */
  readonly montantTVA: string;
  /** négatif */
  readonly montantTTC: string;
}

/** Ligne copiée d'un devis vers une facture (montants déjà calculés côté devis). */
export interface CopiedLigneData {
  readonly ordre: number;
  readonly reference: string | null;
  readonly designation: string;
  readonly description: string | null;
  readonly quantite: string;
  readonly unite: string;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly remise: string;
  readonly tvaCategorieId?: string | null;
  readonly montantHT: string;
  readonly montantTVA: string;
  readonly montantTTC: string;
  readonly type: string;
}

/*
 * Entrée de conversion devis→facture (numéro déjà généré ; totaux recalculés des lignes par
 * l'infra ; statut "brouillon", typeDocument "facture" posés par l'infra).
 */
export interface CreateFromDevisInput {
  readonly devisId: number;
  readonly clientId: number;
  readonly numero: string;
  readonly objet: string | null;
  readonly referenceClient: string | null;
  readonly conditionsPaiement: string | null;
  readonly notes: string | null;
  readonly lignes: readonly CopiedLigneData[];
}

/*
 * Entrée de création d'un avoir (numéro/totaux déjà calculés par le use-case ; statut "validee",
 * typeDocument "avoir" posés par l'infra).
 */
export interface CreateAvoirInput {
  readonly factureOrigineId: number;
  readonly clientId: number;
  readonly numero: string;
  readonly objet: string | null;
  readonly notes: string | null;
  readonly conditionsPaiement: string | null;
  readonly lignes: readonly AvoirLigneData[];
}
