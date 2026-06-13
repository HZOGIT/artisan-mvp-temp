import type { TenantContext } from "../../../shared/tenant";
import type { NoteDeFrais, CreateNoteDeFraisInput, UpdateNoteDeFraisInput } from "../domain/note-de-frais";

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
}
