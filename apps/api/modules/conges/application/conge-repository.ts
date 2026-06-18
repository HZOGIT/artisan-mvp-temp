import type { TenantContext } from "../../../shared/tenant";
import type { Conge, CongeStatut, CreateCongeInput, UpdateCongeInput } from "../domain/conge";
import type { SoldeCongeType } from "./solde";

// Ajustement additif du solde de congés d'un technicien (décompte si deltaJours > 0,
// recrédit si < 0), pour une année et un type donnés.
export interface AjustementSolde {
  readonly technicienId: number;
  readonly type: SoldeCongeType;
  readonly annee: number;
  readonly deltaJours: number;
}

// Port du repository conges. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `conges` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ Les invariants
// sensibles (anti self-approbation, idempotence du solde, recrédit à l'annulation) sont
// portés par les use-cases du workflow d'approbation (étape ultérieure), pas par le CRUD.
export interface ICongeRepository {
  list(ctx: TenantContext): Promise<Conge[]>;
  // Demandes en attente d'approbation (statut `en_attente`), scopées tenant, triées par
  // `dateDebut` ASC (parité legacy `getCongesEnAttente`). Vue du manager/approbateur.
  listEnAttente(ctx: TenantContext): Promise<Conge[]>;
  // null si la demande n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Conge | null>;
  create(ctx: TenantContext, input: CreateCongeInput): Promise<Conge>;
  // null si la demande n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateCongeInput): Promise<Conge | null>;
  // false si la demande n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // true si le technicien (demandeur) appartient au tenant. Garde anti-IDOR-FK : interdit de
  // créer/affecter une demande de congé à un technicien d'un autre tenant.
  ownsTechnicien(ctx: TenantContext, technicienId: number): Promise<boolean>;
  // Identifiant de la fiche technicien liée à l'utilisateur courant dans le tenant, ou null.
  // Sert à la garde **anti self-approbation** (l'approbateur ne doit pas être le demandeur).
  findTechnicienIdForUser(ctx: TenantContext): Promise<number | null>;
  // Applique une décision du workflow (statut + validePar + dateValidation + commentaire),
  // scopé tenant. null si la demande n'appartient pas au tenant. ⚠️ N'altère PAS le solde
  // (intégration du solde portée séparément).
  setStatut(
    ctx: TenantContext,
    id: number,
    statut: CongeStatut,
    validePar: number,
    commentaire?: string | null,
  ): Promise<Conge | null>;
  // Ajuste (additivement) le solde de congés du technicien, scopé tenant. Check-then-act :
  // ligne présente → update ; absente + décompte (>0) → insert ; absente + recrédit (≤0) →
  // no-op (rien à recréditer). ⚠️ Idempotence garantie par l'appelant (décompte uniquement à
  // la transition en_attente→approuve, recrédit uniquement en quittant approuve).
  ajusterSolde(ctx: TenantContext, ajustement: AjustementSolde): Promise<void>;
}
