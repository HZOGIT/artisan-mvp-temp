import type { TenantContext } from "../../../shared/tenant";
import type { IPrevisionCARepository } from "./prevision-ca-repository";
import type { FacturesCAReader } from "./factures-ca-reader";
import type { HistoriqueCA, PrevisionMethode, PredictionMois, CalculPrevisionsResult } from "../domain/prevision-ca";

/*
 * Use-case `calculer` (forecasting). Recalcule l'historique de CA depuis les factures PAYÉES du
 * tenant, puis projette les prévisions de l'année courante selon la méthode. Parité legacy
 * `calculerHistoriqueCAMensuel` + `calculerPrevisionsCA`.
 */

export interface CalculerDeps {
  readonly repo: IPrevisionCARepository;
  readonly facturesReader: FacturesCAReader;
}

function num(s: string | null | undefined): number {
  const n = parseFloat(String(s ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/*
 * PUR : à partir de l'historique (≤24 mois) et de la méthode, calcule 12 prédictions mensuelles
 * (CA prévisionnel + confiance). Parité legacy `calculerPrevisionsCA` (mêmes formules/arrondis).
 */
export function computePredictions(historique: readonly HistoriqueCA[], methode: PrevisionMethode): PredictionMois[] {
  const moyenneParMois = new Map<number, { total: number; count: number }>();
  for (const h of historique) {
    const m = moyenneParMois.get(h.mois) ?? { total: 0, count: 0 };
    m.total += num(h.caTotal);
    m.count++;
    moyenneParMois.set(h.mois, m);
  }
  const overallAvg = historique.length > 0 ? historique.reduce((s, h) => s + num(h.caTotal), 0) / historique.length : 0;

  const predictions: PredictionMois[] = [];
  for (let mois = 1; mois <= 12; mois++) {
    let caPrevisionnel: number;
    let confiance: number;
    if (methode === "saisonnalite") {
      const md = moyenneParMois.get(mois);
      caPrevisionnel = md ? md.total / md.count : overallAvg;
      confiance = md ? Math.min(90, 50 + md.count * 15) : 30;
    } else if (methode === "regression_lineaire") {
      caPrevisionnel = overallAvg * (1 + 0.02 * (mois / 12));
      confiance = Math.min(75, 40 + historique.length * 2);
    } else {
      /** moyenne_mobile (défaut) ; 'manuel' n'est pas utilisé par `calculer` mais retombe ici par sûreté. */
      caPrevisionnel = overallAvg;
      confiance = Math.min(80, 30 + historique.length * 3);
    }
    predictions.push({ mois, caPrevisionnel: Math.round(caPrevisionnel * 100) / 100, confiance: Math.round(confiance) });
  }
  return predictions;
}

export async function calculerPrevisions(
  deps: CalculerDeps,
  ctx: TenantContext,
  methode: PrevisionMethode,
): Promise<CalculPrevisionsResult> {
  /** 1) Recalcul de l'historique depuis les factures payées (agrégées par mois/année). */
  const agg = await deps.facturesReader.aggregatePaidByMonth(ctx);
  for (const a of agg) {
    const panierMoyen = a.nombreFactures > 0 ? num(a.caTotal) / a.nombreFactures : 0;
    await deps.repo.upsertHistorique(ctx, {
      mois: a.mois,
      annee: a.annee,
      caTotal: a.caTotal,
      nombreFactures: a.nombreFactures,
      nombreClients: a.nombreClients,
      panierMoyen: String(Math.round(panierMoyen * 100) / 100),
    });
  }

  /** 2) Projection des prévisions à partir de l'historique recalculé. */
  const historique = await deps.repo.listHistorique(ctx, 24);
  if (historique.length === 0) {
    return { message: "Pas assez de données historiques pour calculer les prévisions" };
  }
  const annee = new Date().getFullYear();
  const predictions = computePredictions(historique, methode);
  for (const p of predictions) {
    await deps.repo.upsertPrevision(ctx, {
      mois: p.mois,
      annee,
      caPrevisionnel: String(p.caPrevisionnel),
      methodeCalcul: methode,
      confiance: String(p.confiance),
    });
  }
  return { predictions, methode, annee };
}
