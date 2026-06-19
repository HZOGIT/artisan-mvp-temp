import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type { Contrat, CreateContratInput, UpdateContratInput } from "../domain/contrat";

/*
 * Use-cases d'écriture (création / métadonnées / suppression) — purs, repository injecté.
 * ⚠️ Les transitions de statut (suspendre/reactiver/terminer/annuler) sont des use-cases dédiés
 * (7/9) : elles ne passent pas par `modifierContrat`. Validation métier + anti-IDOR-FK clientId +
 * référence générée serveur.
 */

const DECIMAL_2 = /^\d+(\.\d{1,2})?$/;

function assertMontant(montantHT: string | undefined): void {
  if (montantHT === undefined) return;
  if (!DECIMAL_2.test(montantHT)) throw new ValidationError("Le montant HT doit être un montant positif (2 décimales max)");
}

function assertTaux(tauxTVA: string | undefined): void {
  if (tauxTVA === undefined) return;
  const t = Number(tauxTVA);
  if (!Number.isFinite(t) || t < 0 || t > 100) throw new ValidationError("Le taux de TVA doit être compris entre 0 et 100");
}

function assertDate(d: Date | null | undefined, libelle: string, requise = false): void {
  if (d === undefined || d === null) {
    if (requise) throw new ValidationError(`${libelle} est requise`);
    return;
  }
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new ValidationError(`${libelle} est invalide`);
}

export async function creerContrat(repo: IContratRepository, ctx: TenantContext, input: CreateContratInput): Promise<Contrat> {
  if (!input.titre?.trim()) throw new ValidationError("Le titre est requis");
  assertMontant(input.montantHT);
  if (!DECIMAL_2.test(input.montantHT)) throw new ValidationError("Le montant HT est requis et doit être positif");
  assertTaux(input.tauxTVA);
  assertDate(input.dateDebut, "La date de début", true);
  assertDate(input.dateFin, "La date de fin");
  if (input.dateFin && input.dateFin < input.dateDebut) throw new ValidationError("La date de fin doit être postérieure à la date de début");
  if (input.preavisResiliation !== undefined && (!Number.isInteger(input.preavisResiliation) || input.preavisResiliation < 0)) {
    throw new ValidationError("Le préavis de résiliation doit être un entier positif ou nul");
  }
  /** Anti-IDOR-FK : le client doit appartenir au tenant. NotFound (ne révèle pas l'existence cross-tenant). */
  if (!(await repo.ownsClient(ctx, input.clientId))) throw new NotFoundError("Client introuvable");
  /** Référence générée serveur (jamais fournie par le client). */
  const reference = await repo.nextReference(ctx);
  /** statut="actif" forcé par l'infra */
  return repo.create(ctx, input, reference);
}

export async function modifierContrat(repo: IContratRepository, ctx: TenantContext, id: number, input: UpdateContratInput): Promise<Contrat> {
  if (input.titre !== undefined && !input.titre.trim()) throw new ValidationError("Le titre est requis");
  assertMontant(input.montantHT);
  assertTaux(input.tauxTVA);
  assertDate(input.dateDebut, "La date de début");
  assertDate(input.dateFin, "La date de fin");
  if (input.preavisResiliation !== undefined && (!Number.isInteger(input.preavisResiliation) || input.preavisResiliation < 0)) {
    throw new ValidationError("Le préavis de résiliation doit être un entier positif ou nul");
  }
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Contrat introuvable");
  return updated;
}

export async function supprimerContrat(repo: IContratRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Contrat introuvable");
}
