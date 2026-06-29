import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { Conge, CongeStatut, CreateCongeInput, UpdateCongeInput } from "../domain/conge";
import type { SoldeCongeType } from "./solde";

export interface SoldeResult {
  readonly type: SoldeCongeType;
  readonly annee: number;
  /** YYYY-MM-DD — null sur les lignes legacy (pré-migration période). */
  readonly periodeDebut: string | null;
  readonly periodeFin: string | null;
  readonly exercice: string | null;
  readonly soldeInitial: number;
  readonly soldeRestant: number;
  readonly joursAcquis: number;
  readonly joursPris: number;
  readonly joursReportes: number;
}

/*
 * Ajustement additif du solde de congés d'un technicien (décompte si deltaJours > 0,
 * recrédit si < 0), pour une période et un type donnés.
 */
export interface AjustementSolde {
  readonly technicienId: number;
  readonly type: SoldeCongeType;
  readonly annee: number;
  readonly periodeDebut: string;
  readonly periodeFin: string;
  readonly deltaJours: number;
}

/** Report des CP non pris depuis une période source vers la période suivante. */
export interface ReportSolde {
  readonly technicienId: number;
  readonly type: SoldeCongeType;
  readonly anneeSource: number;
  readonly periodeDebutSource: string;
  readonly joursReportes: number;
  readonly annee: number;
  readonly periodeDebut: string;
  readonly periodeFin: string;
}

/*
 * Port du repository conges. Chaque méthode exige le TenantContext (scope tenant + RLS).
 * `conges` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ Les invariants
 * sensibles (anti self-approbation, idempotence du solde, recrédit à l'annulation) sont
 * portés par les use-cases du workflow d'approbation (étape ultérieure), pas par le CRUD.
 */
export interface ICongeRepository {
  list(ctx: TenantContext): Promise<Conge[]>;
  /*
   * Demandes en attente d'approbation (statut `en_attente`), scopées tenant, triées par
   * `dateDebut` ASC (parité legacy `getCongesEnAttente`). Vue du manager/approbateur.
   */
  listEnAttente(ctx: TenantContext): Promise<Conge[]>;
  /** null si la demande n'appartient pas au tenant. */
  getById(ctx: TenantContext, id: number): Promise<Conge | null>;
  create(ctx: TenantContext, input: CreateCongeInput): Promise<Conge>;
  /** null si la demande n'appartient pas au tenant. */
  update(ctx: TenantContext, id: number, input: UpdateCongeInput): Promise<Conge | null>;
  /** false si la demande n'appartient pas au tenant. */
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  /*
   * true si le technicien (demandeur) appartient au tenant. Garde anti-IDOR-FK : interdit de
   * créer/affecter une demande de congé à un technicien d'un autre tenant.
   */
  ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean>;
  /*
   * Identifiant de la fiche technicien liée à l'utilisateur courant dans le tenant, ou null.
   * Sert à la garde **anti self-approbation** (l'approbateur ne doit pas être le demandeur).
   */
  findTechnicienIdForUser(ctx: TenantContext): Promise<number | null>;
  /*
   * Applique une décision du workflow (statut + validePar + dateValidation + commentaire),
   * scopé tenant. null si la demande n'appartient pas au tenant. ⚠️ N'altère PAS le solde
   * (intégration du solde portée séparément).
   */
  setStatut(
    ctx: TenantContext,
    id: number,
    statut: CongeStatut,
    validePar: number,
    commentaire?: string | null,
  ): Promise<Conge | null>;
  /*
   * Ajuste (additivement) le solde de congés du technicien, scopé tenant. Check-then-act :
   * ligne présente → update ; absente + décompte (>0) → insert ; absente + recrédit (≤0) →
   * no-op (rien à recréditer). ⚠️ Idempotence garantie par l'appelant (décompte uniquement à
   * la transition en_attente→approuve, recrédit uniquement en quittant approuve).
   */
  ajusterSolde(ctx: TenantContext, ajustement: AjustementSolde): Promise<void>;
  /**
   * Crée ou met à jour la ligne de la période cible avec `joursReportes`.
   * Idempotent : si la ligne existe déjà, `joursReportes` est mis à jour.
   */
  reporterSolde(ctx: TenantContext, report: ReportSolde): Promise<void>;
  getSolde(ctx: TenantContext, technicienId: number, annee: number, periodeDebut?: string): Promise<SoldeResult[]>;
  /** Date d'embauche (techniciens.createdAt) du technicien, null s'il n'appartient pas au tenant. */
  getTechnicienDateEmbauche(ctx: TenantContext, technicienId: number): Promise<Date | null>;
  /**
   * Tous les techniciens du tenant avec leur date d'embauche et CP pris pour `annee` / `periodeDebut`.
   * Une ligne par technicien actif (joursAcquis calculé par le use-case appelant).
   */
  listTechniciensSolde(ctx: TenantContext, annee: number, periodeDebut?: string): Promise<Array<{ technicienId: number; dateEmbauche: Date; joursPris: number; joursReportes: number }>>;
  /*
   * Vérifie si le technicien a déjà un congé (en_attente ou approuvé) dont la période
   * chevauche [dateDebut, dateFin]. `excludeId` exclut la demande elle-même (modification).
   */
  hasOverlap(
    ctx: TenantContext,
    opts: { technicienId: number; dateDebut: string; dateFin: string; excludeId?: number },
  ): Promise<boolean>;
  withDb(db: DbClient): ICongeRepository;
}
