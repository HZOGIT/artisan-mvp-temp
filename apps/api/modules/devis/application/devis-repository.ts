import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type {
  Devis,
  DevisLigne,
  DevisStatut,
  CreateDevisInput,
  UpdateDevisInput,
  CreateDevisLigneInput,
  UpdateDevisLigneInput,
} from "../domain/devis";

/** Ligne brute du JOIN devis × clients pour listAcceptesAvecClient. */
export interface DevisAccepteRow {
  readonly id: number;
  readonly numero: string;
  readonly objet: string | null;
  readonly totalTTC: string | null;
  readonly dateDevis: Date | null;
  readonly clientNom: string | null;
  readonly clientPrenom: string | null;
}

/*
 * Port du repository devis. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * `devis` possède un `artisanId` → double cloisonnement RLS + filtre. Les `devis_lignes` (SANS
 * artisanId) sont scopées via l'appartenance du devis parent au tenant. ⚠️ Domaine financier :
 * les totaux (totalHT/TVA/TTC) sont calculés côté repo/use-case (jamais fournis par le client),
 * la numérotation est générée serveur (`nextNumero`), et les invariants sensibles (TVA dérivée,
 * **immutabilité post-signature**, transitions de statut, conversion en facture) sont portés par
 * les use-cases (étapes ultérieures), pas par le CRUD.
 */
export interface IDevisRepository {
  list(ctx: TenantContext): Promise<Devis[]>;
  /** Devis acceptés du tenant avec nom client, en une seule requête JOIN (anti N+1). */
  listAcceptesAvecClient(ctx: TenantContext): Promise<DevisAccepteRow[]>;
  /*
   * Devis « non signés » (statut ∈ {brouillon, envoye}), du plus récent au plus ancien — base des
   * relances et de `getDevisNonSignes`. Scopé tenant.
   */
  listNonSignes(ctx: TenantContext): Promise<Devis[]>;
  /** null si le devis n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<Devis | null>;
  create(ctx: TenantContext, input: CreateDevisInput): Promise<Devis>;
  /** null si le devis n'appartient pas au tenant. */
  update(ctx: TenantContext, id: number, input: UpdateDevisInput): Promise<Devis | null>;
  /** false si le devis n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;

  /*
   * Définit le statut d'un devis (transition pilotée par le use-case workflow) — null hors
   * tenant. La machine à états (transitions valides, idempotence, immutabilité) est portée par
   * le use-case, pas par le repo.
   */
  setStatut(ctx: TenantContext, id: number, statut: DevisStatut): Promise<Devis | null>;
  /*
   * Prochain numéro de devis, scopé tenant, généré serveur (jamais fourni par le client) →
   * intégrité de la numérotation commerciale (parité legacy `getNextDevisNumber`).
   */
  nextNumero(ctx: TenantContext): Promise<string>;
  /**
   * Crée un devis en allouant le numéro atomiquement dans la même transaction (advisory lock +
   * incrément + INSERT atomiques) — élimine le trou de numérotation entre nextNumero et create.
   */
  createWithNumero(ctx: TenantContext, input: Omit<CreateDevisInput, 'numero'>): Promise<Devis>;
  /** true si le client référencé appartient au tenant (anti-IDOR-FK avant rattachement). */
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;

  /** Lignes d'un devis — [] si le devis n'appartient pas au tenant. */
  listLignes(ctx: TenantContext, devisId: number): Promise<DevisLigne[]>;
  /** Ajoute une ligne (montants recalculés) — null si le devis n'appartient pas au tenant. */
  addLigne(ctx: TenantContext, devisId: number, input: CreateDevisLigneInput): Promise<DevisLigne | null>;
  /** Modifie une ligne (montants recalculés) — null si la ligne ne relève pas d'un devis du tenant. */
  updateLigne(ctx: TenantContext, ligneId: number, input: UpdateDevisLigneInput): Promise<DevisLigne | null>;
  /** false si la ligne ne relève pas d'un devis du tenant. */
  deleteLigne(ctx: TenantContext, ligneId: number): Promise<boolean>;

  /**
   * True si le devis possède une signature acceptée par le client (`signatures_devis.statut='accepte'`).
   * Utilisé par les use-cases d'écriture pour bloquer toute mutation sur un devis signé par le client,
   * quelle que soit la valeur de `devis.statut` (protection contre les désynchronisations).
   */
  signatureAccepteeParClient(ctx: TenantContext, devisId: number): Promise<boolean>;

  /** Retourne une nouvelle instance du repo utilisant `db` (pool ou tx Drizzle) — pour l'atomicité outbox. */
  withDb(db: DbClient): IDevisRepository;
}
