import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "./chantier-repository";
import type { ChantierDocument, AddDocumentInput } from "../domain/chantier";

// Use-cases « documents de chantier » (table `documents_chantier`, SANS artisanId → scopée via le
// chantier parent). Anti-IDOR : toute opération exige l'ownership du chantier. Pour delete (entrée =
// `id` du document seul), on lit d'abord le document (non scopé) pour récupérer son `chantierId`,
// puis on vérifie que ce chantier appartient au tenant.

// Documents d'un chantier possédé (404 sinon), récents d'abord.
export async function getDocumentsChantier(repo: IChantierRepository, ctx: TenantContext, chantierId: number): Promise<ChantierDocument[]> {
  if (!(await repo.getById(ctx, chantierId))) throw new NotFoundError("Chantier introuvable");
  return repo.listDocuments(ctx, chantierId);
}

export type AjouterDocumentInput = AddDocumentInput;

// Ajoute un document sous un chantier possédé (404 sinon).
export async function ajouterDocument(repo: IChantierRepository, ctx: TenantContext, input: AjouterDocumentInput): Promise<ChantierDocument> {
  if (!(await repo.getById(ctx, input.chantierId))) throw new NotFoundError("Chantier introuvable");
  return repo.addDocument(ctx, input);
}

// Supprime un document (par id). Anti-IDOR : le document doit exister (404) ET son chantier parent
// appartenir au tenant (404 sinon — la table documents n'est pas scopée tenant).
export async function supprimerDocument(repo: IChantierRepository, ctx: TenantContext, id: number): Promise<void> {
  const doc = await repo.getDocumentById(ctx, id);
  if (!doc) throw new NotFoundError("Document introuvable");
  if (!(await repo.getById(ctx, doc.chantierId))) throw new NotFoundError("Document introuvable");
  await repo.deleteDocument(ctx, id);
}
