import type { TenantContext } from "../../../shared/tenant";
import type { ICommandeRepository } from "./commande-repository";
import type { IFournisseurRepository } from "../../fournisseurs/application/fournisseur-repository";
import type { Commande } from "../domain/commande";
import type { Fournisseur } from "../../fournisseurs/domain/fournisseur";

// Performance d'un fournisseur (parité legacy `getPerformancesFournisseurs`). Stats dérivées des
// commandes du tenant, regroupées par fournisseur. Montants en NUMBER (calcul JS, parité legacy).
export interface PerformanceFournisseur {
  readonly fournisseur: { id: number; nom: string; contact: string | null; email: string | null; telephone: string | null };
  readonly totalCommandes: number;
  readonly commandesLivrees: number;
  readonly commandesEnRetard: number;
  readonly delaiMoyenLivraison: number | null;
  readonly tauxFiabilite: number;
  readonly montantTotal: number;
}

const JOUR_MS = 86_400_000;

// Calcul PUR (testable sans DB) : pour chaque fournisseur, agrège ses commandes « réelles »
// (hors brouillon). Réplique fidèlement la logique legacy.
export function calculerPerformancesFournisseurs(
  commandes: readonly Commande[],
  fournisseurs: readonly Fournisseur[],
  now: number = Date.now(),
): PerformanceFournisseur[] {
  const byFournisseur = new Map<number, Commande[]>();
  for (const c of commandes) {
    const arr = byFournisseur.get(c.fournisseurId) ?? [];
    arr.push(c);
    byFournisseur.set(c.fournisseurId, arr);
  }

  return fournisseurs.map((f) => {
    const list = (byFournisseur.get(f.id) ?? []).filter((c) => c.statut !== "brouillon");
    const livrees = list.filter((c) => c.statut === "livree");

    const commandesEnRetard = list.filter((c) => {
      const prevu = c.dateLivraisonPrevue ? c.dateLivraisonPrevue.getTime() : null;
      if (prevu == null) return false;
      if (c.statut === "livree") return c.dateLivraisonReelle ? c.dateLivraisonReelle.getTime() > prevu : false;
      if (c.statut === "annulee") return false;
      return prevu < now; // en cours, échéance dépassée
    }).length;

    // Délai moyen (jours) sur les livrées datées.
    const livreesDatees = livrees.filter((c) => c.dateLivraisonReelle && c.createdAt);
    let delaiMoyenLivraison: number | null = null;
    if (livreesDatees.length > 0) {
      const somme = livreesDatees.reduce((s, c) => {
        const d = (c.dateLivraisonReelle!.getTime() - c.createdAt.getTime()) / JOUR_MS;
        return s + Math.max(0, d);
      }, 0);
      delaiMoyenLivraison = Math.round(somme / livreesDatees.length);
    }

    // Taux de fiabilité : % de commandes livrées « à temps ».
    const livreesAvecPrevu = livrees.filter((c) => c.dateLivraisonPrevue && c.dateLivraisonReelle);
    let tauxFiabilite = 100;
    if (livreesAvecPrevu.length > 0) {
      const aTemps = livreesAvecPrevu.filter((c) => c.dateLivraisonReelle!.getTime() <= c.dateLivraisonPrevue!.getTime()).length;
      tauxFiabilite = Math.round((aTemps / livreesAvecPrevu.length) * 100);
    }

    const montantTotal = list.reduce((s, c) => s + (Number.parseFloat(c.totalTTC ?? c.montantTotal ?? "0") || 0), 0);

    return {
      fournisseur: { id: f.id, nom: f.nom, contact: f.contact, email: f.email, telephone: f.telephone },
      totalCommandes: list.length,
      commandesLivrees: livrees.length,
      commandesEnRetard,
      delaiMoyenLivraison,
      tauxFiabilite,
      montantTotal,
    };
  });
}

// Orchestration : charge commandes + fournisseurs du tenant puis agrège (scopé tenant).
export async function getPerformancesFournisseurs(
  commandeRepo: ICommandeRepository,
  fournisseurRepo: IFournisseurRepository,
  ctx: TenantContext,
): Promise<PerformanceFournisseur[]> {
  const [commandes, fournisseurs] = await Promise.all([commandeRepo.list(ctx), fournisseurRepo.list(ctx)]);
  return calculerPerformancesFournisseurs(commandes, fournisseurs);
}
