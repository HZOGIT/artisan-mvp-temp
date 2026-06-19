import { NotFoundError, ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type { ContratFactureGenerator, FactureGenereeRef } from "./contrat-facture-generator";
import type {
  ContratIntervention,
  ContratAFacturer,
  ContratPeriodicite,
  CreateContratInterventionInput,
  UpdateContratInterventionInput,
} from "../domain/contrat";

/*
 * Use-cases de la sous-ressource « interventions de contrat » + liste « à facturer ». Purs (repo
 * injecté). ⚠️ Anti-IDOR : toute opération sur une intervention exige que le contrat parent
 * appartienne au tenant (vérifié via getById → 404 sinon), ET que l'intervention relève bien de ce
 * contrat (appariement id↔contratId) — sinon un id d'intervention d'un autre tenant serait modifiable.
 */

/*
 * Contrats dont l'échéance de facturation est atteinte, enrichis (TTC dérivé HT×(1+TVA), jours de
 * retard depuis `prochainFacturation`). Parité legacy `contrats.getAFacturer`.
 */
export async function listContratsAFacturer(
  repo: IContratRepository,
  ctx: TenantContext,
  maintenant: () => Date = () => new Date(),
): Promise<ContratAFacturer[]> {
  const now = maintenant().getTime();
  const rows = await repo.listAFacturer(ctx);
  return rows.map((c) => {
    const montantHT = parseFloat(c.montantHT || "0") || 0;
    const tauxTVA = parseFloat(c.tauxTVA || "0") || 0;
    const montantTTC = montantHT * (1 + tauxTVA / 100);
    const joursRetard = c.prochainFacturation
      ? Math.max(0, Math.floor((now - c.prochainFacturation.getTime()) / 86_400_000))
      : 0;
    return { ...c, montantTTC: montantTTC.toFixed(2), joursRetard };
  });
}

// Interventions d'un contrat (ownership du contrat requis → 404 sinon).
export async function getInterventionsContrat(
  repo: IContratRepository,
  ctx: TenantContext,
  contratId: number,
): Promise<ContratIntervention[]> {
  if (!(await repo.getById(ctx, contratId))) throw new NotFoundError("Contrat introuvable");
  return repo.listInterventions(ctx, contratId);
}

// Crée une intervention sous un contrat possédé (404 si le contrat n'est pas du tenant).
export async function creerInterventionContrat(
  repo: IContratRepository,
  ctx: TenantContext,
  input: CreateContratInterventionInput,
): Promise<ContratIntervention> {
  if (!(await repo.getById(ctx, input.contratId))) throw new NotFoundError("Contrat introuvable");
  return repo.createIntervention(ctx, input);
}

// Nombre de mois d'une période de facturation, par périodicité.
const MOIS_PAR_PERIODICITE: Record<ContratPeriodicite, number> = { mensuel: 1, trimestriel: 3, semestriel: 6, annuel: 12 };

/*
 * Ajout de `n` mois avec clamp de fin de mois (équivalent relativedelta — parité legacy
 * `addMonthsClamped`) : évite le débordement (31 jan + 1 mois → 28/29 fév, pas 2/3 mars). Pur.
 */
export function addMonthsClamped(base: Date, n: number): Date {
  const day = base.getDate();
  const r = new Date(base);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const lastDayOfTargetMonth = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDayOfTargetMonth));
  return r;
}

/*
 * Génère une facture (émise) pour un contrat (parité legacy `contrats.generateFacture`) :
 *  - ownership du contrat (404 sinon) ;
 *  - crée une facture **émise** via le `ContratFactureGenerator` (1 ligne = prestation du contrat,
 *    totaux dérivés, numéro serveur ; ⚠️ PAS d'écritures FEC — parité legacy) ;
 *  - enregistre la **facture récurrente** (période courante → period+1 selon la périodicité, clamp) ;
 *  - **avance `prochainFacturation`** à la fin de période.
 * Horloge injectable (`maintenant`) pour des tests déterministes.
 */
export async function genererFactureContrat(
  repo: IContratRepository,
  factureGen: ContratFactureGenerator,
  ctx: TenantContext,
  contratId: number,
  maintenant: () => Date = () => new Date(),
): Promise<FactureGenereeRef> {
  const contrat = await repo.getById(ctx, contratId);
  if (!contrat) throw new NotFoundError("Contrat introuvable");

  const now = maintenant();
  /*
   * Idempotence / échéance : on n'émet PAS une nouvelle facture tant que la prochaine échéance de
   * facturation n'est pas atteinte. Sans cette garde, un double-clic / retry réseau crée DEUX factures
   * `envoyee` (finalisées, corrigibles par avoir uniquement) → double facturation du client.
   */
  if (contrat.prochainFacturation && now < new Date(contrat.prochainFacturation)) {
    throw new ConflictError("Une facture a déjà été émise pour cette période (prochaine échéance de facturation non atteinte).");
  }

  const facture = await factureGen.genererFactureEmise(ctx, {
    clientId: contrat.clientId,
    objet: `${contrat.titre} - ${contrat.reference}`,
    designation: contrat.titre,
    description: contrat.description,
    montantHT: contrat.montantHT,
    tauxTVA: contrat.tauxTVA,
  });

  const periodeFin = addMonthsClamped(now, MOIS_PAR_PERIODICITE[contrat.periodicite] ?? 1);
  await repo.recordFactureRecurrente(ctx, {
    contratId,
    factureId: facture.id,
    periodeDebut: now,
    periodeFin,
    genereeAutomatiquement: false,
  });
  await repo.update(ctx, contratId, { prochainFacturation: periodeFin });
  return facture;
}

/*
 * Met à jour une intervention. ⚠️ Anti-IDOR (parité legacy) : le contrat parent doit être du
 * tenant ET l'intervention doit relever de CE contrat (sinon `id` découplé de `contratId` → IDOR).
 */
export async function modifierInterventionContrat(
  repo: IContratRepository,
  ctx: TenantContext,
  id: number,
  contratId: number,
  input: UpdateContratInterventionInput,
): Promise<ContratIntervention> {
  if (!(await repo.getById(ctx, contratId))) throw new NotFoundError("Contrat introuvable");
  const existante = await repo.getInterventionById(ctx, id);
  if (!existante || existante.contratId !== contratId) throw new NotFoundError("Intervention introuvable");
  const updated = await repo.updateIntervention(ctx, id, input);
  if (!updated) throw new NotFoundError("Intervention introuvable");
  return updated;
}
