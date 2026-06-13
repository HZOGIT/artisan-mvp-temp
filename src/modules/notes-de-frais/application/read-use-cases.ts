import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { INoteDeFraisRepository } from "./note-de-frais-repository";
import type { NoteDeFrais } from "../domain/note-de-frais";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getNoteDeFrais` sur une ressource d'un autre tenant
// → le repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).

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
