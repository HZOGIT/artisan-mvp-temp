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
  // Prochain numéro de note de frais (`NDF-00001`), scopé tenant, généré côté serveur (jamais fourni
  // par le client) → numérotation comptable maîtrisée (parité legacy `getNextNoteFraisNumero`).
  nextNumero(ctx: TenantContext): Promise<string>;

  // ── Lien dépense ↔ note de frais (`notes_frais_depenses`, SANS artisan_id) ────────────────────
  // ⚠️ Anti-IDOR : la note ET la dépense doivent appartenir au tenant ; la dépense doit être
  // REMBOURSABLE (une note ne regroupe que des avances salarié). Échec silencieux sinon (skip).
  // Idempotent (lien unique). Recalcule ensuite `montant_total` (= SUM des dépenses remboursables
  // liées). Parité legacy `addDepenseToNoteFrais` + `calculerTotalNoteFrais`.
  addDepenseLink(ctx: TenantContext, noteId: number, depenseId: number): Promise<void>;
  // Retire le lien (note du tenant requise ; skip silencieux sinon) puis recalcule `montant_total`.
  removeDepenseLink(ctx: TenantContext, noteId: number, depenseId: number): Promise<void>;

  // Propage un statut aux dépenses REMBOURSABLES liées à la note (via `notes_frais_depenses`),
  // scopé tenant (note du tenant requise → skip silencieux sinon ; RLS sur `depenses.artisan_id`).
  // Au remboursement, marque aussi `rembourse` + `date_remboursement`. Primitive « dumb » : la
  // décision métier (quel statut à quelle transition) est portée par les use-cases du workflow.
  // Parité legacy `payerNoteFrais` (cascade `depenses.statut`/`rembourse`/`date_remboursement`).
  appliquerStatutDepensesLiees(
    ctx: TenantContext,
    noteId: number,
    patch: { statut: DepenseLieeStatut; rembourse?: boolean; dateRemboursement?: string },
  ): Promise<void>;
}

// Statuts propageables aux dépenses liées (sous-ensemble de DepenseStatut atteignable par le
// workflow note de frais). Défini ici pour garder le port découplé du domaine `depenses`.
export type DepenseLieeStatut = "soumise" | "approuvee" | "rejetee" | "remboursee";
