import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { INoteDeFraisRepository } from "./note-de-frais-repository";
import type { NoteDeFrais, NoteDeFraisDetail, NoteDeFraisListItem } from "../domain/note-de-frais";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
 * `TenantContext` (le repo l'applique). `getNoteDeFrais` sur une ressource d'un autre tenant
 * → le repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).
 */

export function listNotesDeFrais(repo: INoteDeFraisRepository, ctx: TenantContext): Promise<NoteDeFrais[]> {
  return repo.list(ctx);
}

export async function getNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  id: number,
): Promise<NoteDeFrais> {
  const note = await repo.getById(ctx, id);
  if (!note) throw new NotFoundError("Note de frais introuvable");
  return note;
}

/** Liste enrichie du compteur de dépenses liées par note. */
export async function listNotesDeFraisAvecCompte(repo: INoteDeFraisRepository, ctx: TenantContext): Promise<NoteDeFraisListItem[]> {
  const [notes, counts] = await Promise.all([repo.list(ctx), repo.countDepensesByNote(ctx)]);
  return notes.map((n) => ({ ...n, nbDepenses: counts.get(n.id) ?? 0 }));
}

/*
 * Détail enrichi des dépenses liées. ⚠️ Parité `getNoteFraisById` : renvoie `null` si la
 * note n'appartient pas au tenant (PAS 404 — ne pas révéler l'existence cross-tenant).
 */
export async function getNoteFraisDetail(repo: INoteDeFraisRepository, ctx: TenantContext, id: number): Promise<NoteDeFraisDetail | null> {
  const note = await repo.getById(ctx, id);
  if (!note) return null;
  const depenses = await repo.getDepensesForNote(ctx, id);
  return { ...note, depenses };
}
