import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { INoteDeFraisRepository } from "./note-de-frais-repository";
import type { NoteDeFrais, CreateNoteDeFraisInput, UpdateNoteDeFraisInput } from "../domain/note-de-frais";

// Use-cases d'écriture — purs, repository injecté. ⚠️ **Le demandeur est TOUJOURS l'utilisateur
// courant** (`userId = ctx.userId`) — parité legacy `createNoteFrais` (`userId: ctx.user.id`) :
// on ne crée une note que pour soi-même, donc pas d'IDOR possible sur le demandeur. Le workflow
// d'approbation (statut/montant remboursé) est porté séparément.

// Dates ISO `YYYY-MM-DD` → comparaison lexicographique = chronologique.
function assertPeriodeCoherente(debut?: string, fin?: string): void {
  if (debut && fin && fin < debut) {
    throw new ValidationError("La fin de période doit être postérieure ou égale au début");
  }
}

function assertMontant(valeur: string | undefined, libelle: string): void {
  if (valeur != null && valeur !== "" && Number(valeur) < 0) {
    throw new ValidationError(`${libelle} invalide`);
  }
}

export async function creerNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  // L'appelant ne fournit JAMAIS `userId` : il est forcé à l'utilisateur courant.
  input: Omit<CreateNoteDeFraisInput, "userId">,
): Promise<NoteDeFrais> {
  if (!input.titre?.trim()) throw new ValidationError("Le titre est requis");
  if (!input.numero?.trim()) throw new ValidationError("Le numéro est requis");
  assertPeriodeCoherente(input.periodeDebut, input.periodeFin);
  assertMontant(input.montantTotal, "Montant total");
  assertMontant(input.montantRembourse, "Montant remboursé");
  return repo.create(ctx, { ...input, userId: ctx.userId });
}

export async function modifierNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateNoteDeFraisInput,
): Promise<NoteDeFrais> {
  if (input.titre !== undefined && !input.titre.trim()) throw new ValidationError("Le titre est requis");
  assertPeriodeCoherente(input.periodeDebut, input.periodeFin);
  assertMontant(input.montantTotal, "Montant total");
  assertMontant(input.montantRembourse, "Montant remboursé");
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Note de frais introuvable");
  return updated;
}

export async function supprimerNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  id: number,
): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Note de frais introuvable");
}

// --- Workflow (transitions de statut). ⚠️ Anti self-approbation sur approuver/rejeter. La
// cascade legacy sur les `depenses` liées (marquage soumise/approuvee/remboursee) sort du
// périmètre de ce module (domaine `depenses` non migré) — divergence consignée en finding.
// L'intégration du montant remboursé + l'auto-numérotation sont portées séparément. ---

const aujourdhui = (): string => new Date().toISOString().slice(0, 10);

async function chargerNote(repo: INoteDeFraisRepository, ctx: TenantContext, id: number): Promise<NoteDeFrais> {
  const note = await repo.getById(ctx, id);
  if (!note) throw new NotFoundError("Note de frais introuvable");
  return note;
}

// ⚠️ Anti self-approbation : l'approbateur (utilisateur courant) ne doit pas être le demandeur
// (`userId` de la note). Ségrégation des tâches : on n'approuve/refuse pas sa propre note.
function assertPasSelfApprobation(ctx: TenantContext, note: NoteDeFrais): void {
  if (ctx.userId === note.userId) {
    throw new ForbiddenError("Vous ne pouvez pas valider votre propre note de frais");
  }
}

export async function soumettreNoteDeFrais(repo: INoteDeFraisRepository, ctx: TenantContext, id: number): Promise<NoteDeFrais> {
  const note = await chargerNote(repo, ctx, id);
  if (note.statut === "soumise") return note; // idempotent
  if (note.statut !== "brouillon") throw new ConflictError("Cette note ne peut plus être soumise");
  const updated = await repo.setWorkflow(ctx, id, { statut: "soumise", dateSoumission: aujourdhui() });
  if (!updated) throw new NotFoundError("Note de frais introuvable");
  return updated;
}

export async function approuverNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  id: number,
  commentaire?: string | null,
): Promise<NoteDeFrais> {
  const note = await chargerNote(repo, ctx, id);
  if (note.statut === "approuvee") return note; // idempotent
  if (note.statut !== "soumise") throw new ConflictError("Seule une note soumise peut être approuvée");
  assertPasSelfApprobation(ctx, note);
  const updated = await repo.setWorkflow(ctx, id, {
    statut: "approuvee",
    dateApprobation: aujourdhui(),
    commentaireApprobateur: commentaire ?? null,
  });
  if (!updated) throw new NotFoundError("Note de frais introuvable");
  return updated;
}

export async function rejeterNoteDeFrais(
  repo: INoteDeFraisRepository,
  ctx: TenantContext,
  id: number,
  commentaire: string,
): Promise<NoteDeFrais> {
  const note = await chargerNote(repo, ctx, id);
  if (note.statut === "rejetee") return note; // idempotent
  if (note.statut !== "soumise") throw new ConflictError("Seule une note soumise peut être rejetée");
  assertPasSelfApprobation(ctx, note);
  const updated = await repo.setWorkflow(ctx, id, { statut: "rejetee", commentaireApprobateur: commentaire });
  if (!updated) throw new NotFoundError("Note de frais introuvable");
  return updated;
}

export async function payerNoteDeFrais(repo: INoteDeFraisRepository, ctx: TenantContext, id: number): Promise<NoteDeFrais> {
  const note = await chargerNote(repo, ctx, id);
  if (note.statut === "payee") return note; // idempotent
  if (note.statut !== "approuvee") throw new ConflictError("Seule une note approuvée peut être payée");
  const updated = await repo.setWorkflow(ctx, id, { statut: "payee", datePaiement: aujourdhui() });
  if (!updated) throw new NotFoundError("Note de frais introuvable");
  return updated;
}

// Lie une dépense (remboursable, du tenant) à une note (du tenant) — anti-IDOR + recalcul du total
// portés par le repo (skip silencieux si ownership/remboursable KO ; idempotent). Renvoie `{success}`
// quoi qu'il arrive (parité legacy : ne révèle pas l'existence cross-tenant).
export async function ajouterDepenseANote(repo: INoteDeFraisRepository, ctx: TenantContext, noteId: number, depenseId: number): Promise<{ success: true }> {
  await repo.addDepenseLink(ctx, noteId, depenseId);
  return { success: true };
}

export async function retirerDepenseDeNote(repo: INoteDeFraisRepository, ctx: TenantContext, noteId: number, depenseId: number): Promise<{ success: true }> {
  await repo.removeDepenseLink(ctx, noteId, depenseId);
  return { success: true };
}
