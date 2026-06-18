import type { TenantContext } from "../../../shared/tenant";
import type { IAlertesPrevisionsRepository } from "./alertes-previsions-repository";
import type { AlerteConfig, AlerteHistorique, SaveAlerteConfigInput } from "../domain/alerte-prevision";
import { calculerEcartPct, evaluerTypeAlerte, choisirCanal, construireMessage, seuilOuDefaut } from "../domain/alerte-prevision";

export function getConfig(repo: IAlertesPrevisionsRepository, ctx: TenantContext): Promise<AlerteConfig | null> {
  return repo.getConfig(ctx);
}

export function saveConfig(repo: IAlertesPrevisionsRepository, ctx: TenantContext, input: SaveAlerteConfigInput): Promise<AlerteConfig | null> {
  return repo.upsertConfig(ctx, input);
}

export function getHistorique(repo: IAlertesPrevisionsRepository, ctx: TenantContext): Promise<AlerteHistorique[]> {
  return repo.listHistorique(ctx);
}

// Vérifie l'écart CA réalisé vs prévisionnel du mois courant et enregistre une alerte si un seuil est
// franchi (parité legacy `verifierEcartsEtEnvoyerAlertes`). Pas de config / inactif / pas de prévision
// / prévision ≤ 0 / écart sous les seuils / alerte du même type déjà enregistrée ce mois → []. L'envoi
// réel (email/sms) est EXTERNE (scheduler) — ici on ne fait qu'enregistrer la ligne d'historique.
export async function verifierEtEnvoyer(repo: IAlertesPrevisionsRepository, ctx: TenantContext, now: Date = new Date()): Promise<AlerteHistorique[]> {
  const config = await repo.getConfig(ctx);
  if (!config || !config.actif) return [];

  const mois = now.getMonth() + 1;
  const annee = now.getFullYear();

  const caPrev = await repo.getPrevisionCA(ctx, mois, annee);
  if (caPrev === null || caPrev <= 0) return [];

  const caReel = await repo.getCaRealiseMois(ctx, mois, annee);
  const ecart = calculerEcartPct(caReel, caPrev);
  const typeAlerte = evaluerTypeAlerte(ecart, seuilOuDefaut(config.seuilAlertePositif), seuilOuDefaut(config.seuilAlerteNegatif));
  if (!typeAlerte) return [];

  // Anti-spam : une seule alerte de chaque type par mois.
  if (await repo.historiqueExiste(ctx, mois, annee, typeAlerte)) return [];

  const ligne = await repo.insertHistorique(ctx, {
    mois,
    annee,
    typeAlerte,
    caPrevisionnel: caPrev.toFixed(2),
    caRealise: caReel.toFixed(2),
    ecartPourcentage: ecart.toFixed(2),
    canalEnvoi: choisirCanal(config.alerteEmail, config.alerteSms),
    statut: "envoye",
    message: construireMessage(typeAlerte, caReel, caPrev, ecart, mois, annee),
  });
  return [ligne];
}
