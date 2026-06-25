import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDevisRepository } from "./devis-repository";
import type {
  Devis,
  DevisLigne,
  DevisStatut,
  CreateDevisInput,
  UpdateDevisInput,
  CreateDevisLigneInput,
  UpdateDevisLigneInput,
} from "../domain/devis";

/*
 * Use-cases d'écriture — purs, repository injecté. ⚠️ Domaine financier SENSIBLE :
 *  - **numero généré côté serveur** (`nextNumero`, jamais fourni par le client) ;
 *  - **anti-IDOR-FK** : le `clientId` rattaché DOIT appartenir au tenant, sinon NotFound ;
 *  - **totaux dérivés des lignes** côté repo (jamais fournis par le client) ;
 *  - **immutabilité post-acceptation** : un devis `accepte` (engagement commercial) ne peut plus
 *    être modifié/supprimé, ni voir ses lignes changer → `ConflictError`. ⚠️ Durcissement : le
 *    legacy ne gardait RIEN (statut librement modifiable, cf. audit immutabilité post-signature).
 */

/** Entrée de création : pas de numero (généré serveur). */
export type CreerDevisInput = Omit<CreateDevisInput, "numero">;

/*
 * Un devis accepté est figé (toute écriture → Conflict). Les autres états restent éditables
 * (brouillon/envoye : travail en cours ; refuse/expire : ré-édition tolérée comme le legacy).
 */
function assertModifiable(devis: Devis): void {
  if (devis.statut === "accepte") {
    throw new ConflictError("Un devis accepté ne peut plus être modifié");
  }
}

async function getDevisOwned(repo: IDevisRepository, ctx: TenantContext, id: number): Promise<Devis> {
  const devis = await repo.getById(ctx, id);
  if (!devis) throw new NotFoundError("Devis introuvable");
  return devis;
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

export async function creerDevis(repo: IDevisRepository, ctx: TenantContext, input: CreerDevisInput): Promise<Devis> {
  /** Anti-IDOR-FK : le client doit appartenir au tenant (ne révèle pas l'existence cross-tenant). */
  if (!(await repo.ownsClient(ctx, input.clientId))) throw new NotFoundError("Client introuvable");
  const numero = await repo.nextNumero(ctx);
  return repo.create(ctx, { ...input, numero });
}

export async function modifierDevis(
  repo: IDevisRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateDevisInput,
): Promise<Devis> {
  const devis = await getDevisOwned(repo, ctx, id);
  assertModifiable(devis);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Devis introuvable");
  return updated;
}

export async function supprimerDevis(repo: IDevisRepository, ctx: TenantContext, id: number): Promise<void> {
  const devis = await getDevisOwned(repo, ctx, id);
  /** Un devis accepté ne peut pas être supprimé (engagement : on conserve la trace). */
  if (devis.statut === "accepte") throw new ConflictError("Un devis accepté ne peut pas être supprimé");
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Devis introuvable");
}

export async function ajouterLigneDevis(
  repo: IDevisRepository,
  ctx: TenantContext,
  devisId: number,
  input: CreateDevisLigneInput,
): Promise<DevisLigne> {
  const devis = await getDevisOwned(repo, ctx, devisId);
  assertModifiable(devis);
  assertLigneValide(input.designation, input.prixUnitaireHT, input.quantite);
  const ligne = await repo.addLigne(ctx, devisId, input);
  if (!ligne) throw new NotFoundError("Devis introuvable");
  return ligne;
}

export async function modifierLigneDevis(
  repo: IDevisRepository,
  ctx: TenantContext,
  devisId: number,
  ligneId: number,
  input: UpdateDevisLigneInput,
): Promise<DevisLigne> {
  const devis = await getDevisOwned(repo, ctx, devisId);
  assertModifiable(devis);
  /** La ligne doit relever de CE devis (lie l'autorisation au devis modifiable vérifié). */
  const lignes = await repo.listLignes(ctx, devisId);
  if (!lignes.some((l) => l.id === ligneId)) throw new NotFoundError("Ligne introuvable");
  assertLigneValide(input.designation, input.prixUnitaireHT, input.quantite);
  const updated = await repo.updateLigne(ctx, ligneId, input);
  if (!updated) throw new NotFoundError("Ligne introuvable");
  return updated;
}

/*
 * Machine à états des devis (durcissement : le legacy laissait le statut libre).
 *  brouillon → envoye ; envoye → accepte | refuse | expire. Les états accepte/refuse/expire
 *  sont **terminaux** (plus de transition). Idempotence : repasser au même statut est un no-op.
 */
const TRANSITIONS: Record<DevisStatut, readonly DevisStatut[]> = {
  brouillon: ["envoye"],
  envoye: ["accepte", "refuse", "expire"],
  accepte: [],
  refuse: [],
  expire: [],
};

export async function changerStatutDevis(
  repo: IDevisRepository,
  ctx: TenantContext,
  id: number,
  cible: DevisStatut,
): Promise<Devis> {
  const devis = await getDevisOwned(repo, ctx, id);
  /** idempotent */
  if (devis.statut === cible) return devis;
  if (!TRANSITIONS[devis.statut].includes(cible)) {
    throw new ConflictError(`Transition de statut invalide : ${devis.statut} → ${cible}`);
  }
  const updated = await repo.setStatut(ctx, id, cible);
  if (!updated) throw new NotFoundError("Devis introuvable");
  return updated;
}

export async function supprimerLigneDevis(
  repo: IDevisRepository,
  ctx: TenantContext,
  devisId: number,
  ligneId: number,
): Promise<void> {
  const devis = await getDevisOwned(repo, ctx, devisId);
  assertModifiable(devis);
  const lignes = await repo.listLignes(ctx, devisId);
  if (!lignes.some((l) => l.id === ligneId)) throw new NotFoundError("Ligne introuvable");
  const ok = await repo.deleteLigne(ctx, ligneId);
  if (!ok) throw new NotFoundError("Ligne introuvable");
}

/*
 * Duplique un devis (parité legacy `devis.duplicate`) : nouveau devis **brouillon**, numéro généré
 * serveur, objet suffixé « (copie) », validité +30 j, lignes copiées (totaux recalculés par le repo
 * à chaque `addLigne`). ⚠️ Scopé tenant (404 hors tenant) ; le client de l'origine est réutilisé
 * (déjà possédé) — pas de nouvelle vérification d'ownership FK.
 */
export async function dupliquerDevis(
  repo: IDevisRepository,
  ctx: TenantContext,
  devisId: number,
  maintenant: () => Date = () => new Date(),
): Promise<Devis> {
  const origine = await getDevisOwned(repo, ctx, devisId);
  const numero = await repo.nextNumero(ctx);
  const dateValidite = new Date(maintenant());
  dateValidite.setDate(dateValidite.getDate() + 30);
  const copie = await repo.create(ctx, {
    clientId: origine.clientId,
    numero,
    objet: origine.objet ? `${origine.objet} (copie)` : "(copie)",
    referenceClient: origine.referenceClient,
    conditionsPaiement: origine.conditionsPaiement,
    notes: origine.notes,
    dateValidite,
  });
  const lignes = await repo.listLignes(ctx, origine.id);
  for (const l of lignes) {
    await repo.addLigne(ctx, copie.id, {
      designation: l.designation,
      description: l.description,
      reference: l.reference,
      quantite: l.quantite,
      unite: l.unite,
      prixUnitaireHT: l.prixUnitaireHT,
      tauxTVA: l.tauxTVA,
      tvaCategorieId: l.tvaCategorieId ?? null,
      ordre: l.ordre,
      type: l.type,
    });
  }
  /** Relit le devis (totaux recalculés par les addLigne) pour renvoyer l'état à jour. */
  const fresh = await repo.getById(ctx, copie.id);
  return fresh ?? copie;
}
