import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IModeleEmailRepository } from "./modele-email-repository";
import { TYPES_MODELE_EMAIL } from "../domain/modele-email";
import type { CreateModeleEmailInput, ModeleEmail, TypeModeleEmail, UpdateModeleEmailInput } from "../domain/modele-email";

// Use-cases d'écriture — purs, repository injecté. Validation métier + ⚠️ INVARIANT « un seul
// modèle isDefault par (artisanId, type) ». Le scoping tenant est porté par le repo.

function assertNonVide(valeur: string | undefined, libelle: string): void {
  if (valeur !== undefined && !valeur.trim()) throw new ValidationError(`${libelle} est requis`);
}

function assertType(type: TypeModeleEmail | undefined): void {
  if (type !== undefined && !TYPES_MODELE_EMAIL.includes(type)) {
    throw new ValidationError("Type de modèle d'email invalide");
  }
}

// Retombe (isDefault=false) tous les modèles du `type` du tenant SAUF celui d'`exclureId` — afin de
// garantir au plus un défaut par (artisanId, type). Lecture + update ciblés via le repo (scopé).
async function retomberAutresDefauts(
  repo: IModeleEmailRepository,
  ctx: TenantContext,
  type: TypeModeleEmail,
  exclureId: number,
): Promise<void> {
  const memeType = await repo.listByType(ctx, type);
  for (const m of memeType) {
    if (m.id !== exclureId && m.isDefault) {
      await repo.update(ctx, m.id, { isDefault: false });
    }
  }
}

export async function creerModeleEmail(
  repo: IModeleEmailRepository,
  ctx: TenantContext,
  input: CreateModeleEmailInput,
): Promise<ModeleEmail> {
  if (!input.nom?.trim()) throw new ValidationError("Le nom est requis");
  if (!input.sujet?.trim()) throw new ValidationError("Le sujet est requis");
  if (!input.contenu?.trim()) throw new ValidationError("Le contenu est requis");
  if (!TYPES_MODELE_EMAIL.includes(input.type)) throw new ValidationError("Type de modèle d'email invalide");
  const created = await repo.create(ctx, input);
  // Si ce nouveau modèle est défaut, il devient le seul défaut de son type.
  if (created.isDefault) await retomberAutresDefauts(repo, ctx, created.type, created.id);
  return created;
}

export async function modifierModeleEmail(
  repo: IModeleEmailRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateModeleEmailInput,
): Promise<ModeleEmail> {
  assertNonVide(input.nom, "Le nom");
  assertNonVide(input.sujet, "Le sujet");
  assertNonVide(input.contenu, "Le contenu");
  assertType(input.type);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Modèle d'email introuvable");
  // Si le modèle est (devenu) défaut, garantir l'unicité sur SON type courant (qui peut avoir
  // changé via l'update) ; on ne retombe jamais le modèle courant lui-même.
  if (updated.isDefault) await retomberAutresDefauts(repo, ctx, updated.type, updated.id);
  return updated;
}

export async function supprimerModeleEmail(repo: IModeleEmailRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Modèle d'email introuvable");
}
