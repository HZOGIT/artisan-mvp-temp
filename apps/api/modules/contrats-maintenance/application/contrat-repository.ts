import type { TenantContext } from "../../../shared/tenant";
import type {
  Contrat,
  ContratStatut,
  CreateContratInput,
  UpdateContratInput,
  ContratIntervention,
  CreateContratInterventionInput,
  UpdateContratInterventionInput,
} from "../domain/contrat";

// Ligne « à facturer » brute (contrat + nom client joint). Le TTC et les jours de retard sont
// dérivés par le use-case (logique pure), pas par le repo.
export type ContratAFacturerRow = Contrat & { readonly clientNom: string };

// Entrée d'enregistrement d'une facture récurrente (table `factures_recurrentes`, sans artisanId →
// scopée via le contrat parent du tenant, ownership vérifié en amont par le use-case).
export interface RecordFactureRecurrenteInput {
  readonly contratId: number;
  readonly factureId: number;
  readonly periodeDebut: Date;
  readonly periodeFin: Date;
  readonly genereeAutomatiquement?: boolean;
}

// Port du repository contrats-maintenance. Chaque méthode exige le TenantContext (scope tenant +
// RLS). `contrats_maintenance` possède un `artisanId` → double cloisonnement RLS + filtre.
// `clientId` est validé via `ownsClient` (anti-IDOR-FK) ; `reference` est générée serveur via
// `nextReference`. Les transitions de statut passent par `setStatut` (use-cases dédiés), pas `update`.
export interface IContratRepository {
  list(ctx: TenantContext): Promise<Contrat[]>;
  // null si le contrat n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Contrat | null>;
  create(ctx: TenantContext, input: CreateContratInput, reference: string): Promise<Contrat>;
  // Met à jour les métadonnées (jamais statut/reference/clientId). null si hors tenant.
  update(ctx: TenantContext, id: number, input: UpdateContratInput): Promise<Contrat | null>;
  // Applique une transition de statut. null si hors tenant.
  setStatut(ctx: TenantContext, id: number, statut: ContratStatut): Promise<Contrat | null>;
  // false si le contrat n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // Le client appartient-il au tenant ? (anti-IDOR-FK)
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  // Génère la prochaine référence de contrat (serveur, scopée tenant) — jamais fournie par le client.
  nextReference(ctx: TenantContext): Promise<string>;

  // Contrats dont l'échéance de facturation est atteinte (statut actif, prochainFacturation ≤ fin de
  // journée), du plus ancien au plus récent, enrichis du nom client (jointure scopée tenant).
  listAFacturer(ctx: TenantContext): Promise<ContratAFacturerRow[]>;

  // ── Sous-ressource interventions du contrat (scopée via le contrat parent du tenant) ──────────
  // Interventions d'un contrat — [] si le contrat n'appartient pas au tenant.
  listInterventions(ctx: TenantContext, contratId: number): Promise<ContratIntervention[]>;
  // Une intervention par id (sans contrôle du contrat parent — l'appariement contrat↔intervention
  // est vérifié par le use-case, anti-IDOR). null si hors tenant.
  getInterventionById(ctx: TenantContext, id: number): Promise<ContratIntervention | null>;
  // Crée une intervention (artisanId forcé, statut "planifiee" posé par l'infra).
  createIntervention(ctx: TenantContext, input: CreateContratInterventionInput): Promise<ContratIntervention>;
  // Met à jour une intervention — null si hors tenant.
  updateIntervention(ctx: TenantContext, id: number, input: UpdateContratInterventionInput): Promise<ContratIntervention | null>;

  // Enregistre une facture récurrente liée à un contrat (`factures_recurrentes`). L'ownership du
  // contrat est vérifié par le use-case ; le repo écrit le lien scopé tenant.
  recordFactureRecurrente(ctx: TenantContext, input: RecordFactureRecurrenteInput): Promise<void>;
}
