import { ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IParametresRepository } from "./parametres-repository";
import type { ParametresArtisan, UpdateParametresInput } from "../domain/parametres";

// Use-case d'écriture — pur, repository injecté. Valide la config avant `upsert` (singleton).
// ⚠️ `UpdateParametresInput` n'expose AUCUN compteur de numérotation → toute écriture de compteur
// est rejetée structurellement par le typage (les compteurs sont pilotés par la numérotation des
// documents). Le scoping tenant est porté par le repo.

const DELAIS_VALIDES = ["net", "fin_de_mois"] as const;
const DECIMAL_2 = /^\d+(\.\d{1,2})?$/; // montant ≥ 0 à 2 décimales max
const HEX_COULEUR = /^#[0-9a-fA-F]{6}$/;

function assertPrefixe(valeur: string | undefined, libelle: string): void {
  if (valeur === undefined) return;
  const v = valeur.trim();
  if (!v) throw new ValidationError(`Le préfixe ${libelle} ne peut pas être vide`);
  if (valeur.length > 10) throw new ValidationError(`Le préfixe ${libelle} est limité à 10 caractères`);
}

function assertEntierPositif(valeur: number | null | undefined, libelle: string): void {
  if (valeur === undefined || valeur === null) return;
  if (!Number.isInteger(valeur) || valeur < 0) throw new ValidationError(`${libelle} doit être un entier positif ou nul`);
}

function assertCouleur(valeur: string | undefined, libelle: string): void {
  if (valeur === undefined) return;
  if (!HEX_COULEUR.test(valeur)) throw new ValidationError(`${libelle} doit être une couleur hexadécimale #RRGGBB`);
}

export async function mettreAJourParametres(
  repo: IParametresRepository,
  ctx: TenantContext,
  input: UpdateParametresInput,
): Promise<ParametresArtisan> {
  assertPrefixe(input.prefixeDevis, "devis");
  assertPrefixe(input.prefixeFacture, "facture");
  assertPrefixe(input.prefixeAvoir, "avoir");
  assertEntierPositif(input.delaiPaiementJours, "Le délai de paiement (jours)");
  assertEntierPositif(input.rappelDevisJours, "Le rappel devis (jours)");
  assertEntierPositif(input.rappelFactureJours, "Le rappel facture (jours)");
  assertEntierPositif(input.objectifDevis, "L'objectif devis");
  assertEntierPositif(input.objectifClients, "L'objectif clients");
  if (input.delaiPaiementType !== undefined && !DELAIS_VALIDES.includes(input.delaiPaiementType as (typeof DELAIS_VALIDES)[number])) {
    throw new ValidationError('Le type de délai de paiement doit être "net" ou "fin_de_mois"');
  }
  if (input.objectifCA !== undefined && !DECIMAL_2.test(input.objectifCA)) {
    throw new ValidationError("L'objectif de CA doit être un montant positif (2 décimales max)");
  }
  assertCouleur(input.couleurPrincipale, "La couleur principale");
  assertCouleur(input.couleurSecondaire, "La couleur secondaire");
  return repo.upsert(ctx, input);
}
