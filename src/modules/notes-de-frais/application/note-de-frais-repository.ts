import type { TenantContext } from "../../../shared/tenant";
import type {
  NoteDeFrais,
  NoteDeFraisStatut,
  CreateNoteDeFraisInput,
  UpdateNoteDeFraisInput,
} from "../domain/note-de-frais";

// Patch appliqué par une transition du workflow (statut + dates/commentaire correspondants).
export interface NoteDeFraisWorkflowPatch {
  readonly statut: NoteDeFraisStatut;
  readonly dateSoumission?: string;
  readonly dateApprobation?: string;
  readonly datePaiement?: string;
  readonly commentaireApprobateur?: string | null;
}

// Port du repository notes-de-frais. Chaque méthode exige le TenantContext (scope tenant +
// RLS). `notes_de_frais` possède un `artisan_id` → double cloisonnement RLS + filtre. ⚠️ Les
// invariants sensibles (anti self-approbation, montants) sont portés par les use-cases du
// workflow d'approbation (étape ultérieure), pas par le CRUD.
export interface INoteDeFraisRepository {
  list(ctx: TenantContext): Promise<NoteDeFrais[]>;
  // null si la note n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<NoteDeFrais | null>;
  create(ctx: TenantContext, input: CreateNoteDeFraisInput): Promise<NoteDeFrais>;
  // null si la note n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateNoteDeFraisInput): Promise<NoteDeFrais | null>;
  // false si la note n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // Applique une transition du workflow (statut + dates/commentaire), scopé tenant. null si la
  // note n'appartient pas au tenant. ⚠️ Les gardes (anti self-approbation, transitions valides,
  // idempotence) sont portées par les use-cases ; l'infra applique seulement le patch.
  setWorkflow(ctx: TenantContext, id: number, patch: NoteDeFraisWorkflowPatch): Promise<NoteDeFrais | null>;
}
