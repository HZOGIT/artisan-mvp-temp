import type { IDepenseRepository } from "./depense-repository";
import type { JobDefinition } from "../../../platform/scheduler";
import { dailyKey } from "../../../platform/scheduler";
import type { DepenseFrequence } from "../domain/depense";
import type { TenantContext } from "../../../shared/tenant";
import { creerDepense } from "./write-use-cases";

/**
 * Calcule la prochaine occurrence à partir d'une date et d'une fréquence.
 * Respecte les fins de mois (31 jan + 1 mois → 28/29 fév).
 */
export function computeNextOccurrence(freq: DepenseFrequence, from: string): string {
  const [y, m, d] = from.split("-").map(Number);
  const months = freq === "mensuelle" ? 1 : freq === "trimestrielle" ? 3 : 12;
  const targetYear = y + Math.floor((m - 1 + months) / 12);
  const targetMonth = ((m - 1 + months) % 12) + 1;
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(d, daysInMonth);
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

/**
 * Génère les dépenses récurrentes échues pour la liste d'artisans donnée.
 * Pour chaque dépense modèle (recurrente=true, prochaineOccurrence <= today) :
 *   1. Met à jour prochaineOccurrence AVANT la création (anti-doublon en cas de crash/restart).
 *   2. Crée une copie non-récurrente datée d'aujourd'hui.
 * Erreurs par dépense silencieuses (best-effort) — une dépense en échec ne bloque pas les suivantes.
 */
export async function genererDepensesRecurrentes(
  repo: IDepenseRepository,
  artisanIds: number[],
  now: Date = new Date(),
): Promise<{ generees: number; erreurs: number }> {
  const today = now.toISOString().slice(0, 10);
  let generees = 0;
  let erreurs = 0;
  for (const artisanId of artisanIds) {
    const ctx: TenantContext = { artisanId, userId: 0 };
    const dues = await repo.listRecurrentesDues(ctx, today);
    for (const source of dues) {
      try {
        /* listRecurrentesDues filtre isNotNull, mais TypeScript ne le sait pas */
        if (!source.frequenceRecurrence || !source.prochaineOccurrence) continue;
        const nextOccurrence = computeNextOccurrence(source.frequenceRecurrence, source.prochaineOccurrence);
        await repo.update(ctx, source.id, { prochaineOccurrence: nextOccurrence });
        await creerDepense(repo, ctx, {
          dateDepense: today,
          fournisseur: source.fournisseur,
          categorie: source.categorie,
          sousCategorie: source.sousCategorie,
          description: source.description,
          montantHt: source.montantHt,
          tauxTva: source.tauxTva ?? undefined,
          modePaiement: source.modePaiement,
          remboursable: source.remboursable,
          chantierId: source.chantierId,
          interventionId: source.interventionId,
          clientId: source.clientId,
          notes: source.notes,
          tvaDeductible: source.tvaDeductible,
          coeffDeductibilite: source.coeffDeductibilite,
          recurrente: false,
          frequenceRecurrence: null,
          prochaineOccurrence: null,
        });
        generees++;
      } catch {
        erreurs++;
      }
    }
  }
  return { generees, erreurs };
}

export interface DepensesRecurrentesJobDeps {
  readonly repo: IDepenseRepository;
  readonly getArtisanIds: () => Promise<number[]>;
  /** Injectée en test pour simuler une date arbitraire. Production : `() => new Date()`. */
  readonly clock?: () => Date;
}

/**
 * Job idempotent de génération des dépenses récurrentes.
 * Clé daily — un seul passage par jour via scheduler_job_runs.
 * Idempotence par dépense : prochaineOccurrence avancée avant création → re-run inoffensif.
 */
export function makeDepensesRecurrentesJob(deps: DepensesRecurrentesJobDeps): JobDefinition {
  return {
    name: "depenses-recurrentes",
    periodKey: dailyKey,
    async run() {
      const ids = await deps.getArtisanIds();
      await genererDepensesRecurrentes(deps.repo, ids, deps.clock?.());
    },
  };
}
