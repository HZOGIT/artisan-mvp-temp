import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IFactureRepository } from "./facture-repository";
import type {
  Facture,
  FactureLigne,
  CreateFactureInput,
  UpdateFactureInput,
  CreateFactureLigneInput,
  UpdateFactureLigneInput,
} from "../domain/facture";

// Use-cases d'écriture — purs, repository injecté. ⚠️ Domaine financier CRITIQUE (pièce légale) :
//  - **numero généré côté serveur** (`nextNumero`, jamais fourni par le client) ;
//  - **anti-IDOR-FK** : `clientId` (et `devisId` si fourni) DOIVENT appartenir au tenant ;
//  - **totaux dérivés des lignes** côté repo (jamais fournis par le client) ;
//  - **immutabilité post-émission** : seule une facture `brouillon` est éditable — toute facture
//    `validee`/`envoyee`/`payee`/`en_retard`/`annulee` est un document fiscal **verrouillé**
//    (parité legacy « Document fiscal verrouillé — émettez un avoir pour corriger ») → Conflict.

// Entrée de création : pas de numero (généré serveur).
export type CreerFactureInput = Omit<CreateFactureInput, "numero">;

// Seul le brouillon est modifiable ; tout autre statut = pièce verrouillée.
function assertModifiable(facture: Facture): void {
  if (facture.statut !== "brouillon") {
    throw new ConflictError("Document fiscal verrouillé — modification interdite (émettez un avoir pour corriger)");
  }
}

async function getFactureOwned(repo: IFactureRepository, ctx: TenantContext, id: number): Promise<Facture> {
  const facture = await repo.getById(ctx, id);
  if (!facture) throw new NotFoundError("Facture introuvable");
  return facture;
}

function assertLigneValide(designation: string | undefined, prixUnitaireHT?: string, quantite?: string): void {
  if (designation !== undefined && !designation.trim()) throw new ValidationError("La désignation est requise");
  if (prixUnitaireHT !== undefined && (!Number.isFinite(Number(prixUnitaireHT)) || Number(prixUnitaireHT) < 0)) {
    throw new ValidationError("Le prix unitaire doit être un nombre positif");
  }
  if (quantite !== undefined && (!Number.isFinite(Number(quantite)) || Number(quantite) < 0)) {
    throw new ValidationError("La quantité doit être un nombre positif");
  }
}

export async function creerFacture(repo: IFactureRepository, ctx: TenantContext, input: CreerFactureInput): Promise<Facture> {
  // Anti-IDOR-FK : client (et devis lié) du tenant uniquement (ne révèle pas l'existence).
  if (!(await repo.ownsClient(ctx, input.clientId))) throw new NotFoundError("Client introuvable");
  if (input.devisId != null && !(await repo.ownsDevis(ctx, input.devisId))) throw new NotFoundError("Devis introuvable");
  const numero = await repo.nextNumero(ctx);
  return repo.create(ctx, { ...input, numero });
}

export async function modifierFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateFactureInput,
): Promise<Facture> {
  const facture = await getFactureOwned(repo, ctx, id);
  assertModifiable(facture);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Facture introuvable");
  return updated;
}

export async function supprimerFacture(repo: IFactureRepository, ctx: TenantContext, id: number): Promise<void> {
  const facture = await getFactureOwned(repo, ctx, id);
  // Une facture émise ne se supprime pas (pièce légale) — on émet un avoir.
  assertModifiable(facture);
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Facture introuvable");
}

export async function ajouterLigneFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  factureId: number,
  input: CreateFactureLigneInput,
): Promise<FactureLigne> {
  const facture = await getFactureOwned(repo, ctx, factureId);
  assertModifiable(facture);
  assertLigneValide(input.designation, input.prixUnitaireHT, input.quantite);
  const ligne = await repo.addLigne(ctx, factureId, input);
  if (!ligne) throw new NotFoundError("Facture introuvable");
  return ligne;
}

export async function modifierLigneFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  factureId: number,
  ligneId: number,
  input: UpdateFactureLigneInput,
): Promise<FactureLigne> {
  const facture = await getFactureOwned(repo, ctx, factureId);
  assertModifiable(facture);
  const lignes = await repo.listLignes(ctx, factureId);
  if (!lignes.some((l) => l.id === ligneId)) throw new NotFoundError("Ligne introuvable");
  assertLigneValide(input.designation, input.prixUnitaireHT, input.quantite);
  const updated = await repo.updateLigne(ctx, ligneId, input);
  if (!updated) throw new NotFoundError("Ligne introuvable");
  return updated;
}

export async function supprimerLigneFacture(
  repo: IFactureRepository,
  ctx: TenantContext,
  factureId: number,
  ligneId: number,
): Promise<void> {
  const facture = await getFactureOwned(repo, ctx, factureId);
  assertModifiable(facture);
  const lignes = await repo.listLignes(ctx, factureId);
  if (!lignes.some((l) => l.id === ligneId)) throw new NotFoundError("Ligne introuvable");
  const ok = await repo.deleteLigne(ctx, ligneId);
  if (!ok) throw new NotFoundError("Ligne introuvable");
}
