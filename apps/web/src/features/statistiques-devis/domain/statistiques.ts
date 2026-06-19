import { subDays, differenceInDays } from "date-fns";
import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAINE de la feature `statistiques-devis` (analyse des performances des devis) (clean-archi) :
 * types dérivés des sorties du routeur tRPC + calcul PUR des statistiques (testable sans réseau ni i18n).
 */

export type Devis = RouterOutputs["devis"]["list"][number];

export const PERIODES = ["7", "30", "90", "365", "all"] as const;
export type Periode = (typeof PERIODES)[number];

export interface DevisStats {
  total: number;
  acceptes: number;
  refuses: number;
  envoyes: number;
  brouillons: number;
  expires: number;
  tauxConversion: number;
  montantTotal: number;
  montantAccepte: number;
  montantEnAttente: number;
  montantPerdu: number;
  montantMoyen: number;
  delaiMoyen: number;
  avecReponseCount: number;
  evolutionTaux: number;
}

const toNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

/*
 * Calcul PUR des stats devis sur une période ("7"/"30"/"90"/"365" jours ou "all") + comparaison à la
 * période précédente (évolution du taux de conversion). `now` injectable pour des tests déterministes.
 * Port fidèle de la logique legacy (`pages/StatistiquesDevis.tsx`).
 */
export function computeDevisStats(
  devisList: readonly Devis[],
  periode: string,
  now: Date = new Date(),
): DevisStats {
  const dateLimit = periode === "all" ? null : subDays(now, parseInt(periode));

  const inPeriod = devisList.filter((d) => {
    if (!dateLimit) return true;
    const dd = d.dateDevis ? new Date(d.dateDevis) : null;
    return !!dd && dd >= dateLimit;
  });

  const countBy = (s: string) => inPeriod.filter((d) => d.statut === s).length;
  const sumBy = (filter: (d: Devis) => boolean) =>
    inPeriod.filter(filter).reduce((sum, d) => sum + toNum(d.totalTTC), 0);

  const total = inPeriod.length;
  const acceptes = countBy("accepte");
  const refuses = countBy("refuse");
  const envoyes = countBy("envoye");
  const brouillons = countBy("brouillon");
  const expires = countBy("expire");

  const traites = acceptes + refuses;
  const tauxConversion = traites > 0 ? (acceptes / traites) * 100 : 0;

  const montantTotal = sumBy(() => true);
  const montantAccepte = sumBy((d) => d.statut === "accepte");
  const montantEnAttente = sumBy((d) => d.statut === "envoye");
  const montantPerdu = sumBy((d) => d.statut === "refuse" || d.statut === "expire");
  const montantMoyen = total > 0 ? montantTotal / total : 0;

  const avecReponse = inPeriod.filter(
    (d) => (d.statut === "accepte" || d.statut === "refuse") && d.dateDevis && d.updatedAt,
  );
  const delaiMoyen =
    avecReponse.length > 0
      ? Math.round(
          avecReponse.reduce((sum, d) => {
            const dDevis = new Date(d.dateDevis as string | Date);
            const dRep = new Date(d.updatedAt as string | Date);
            return sum + differenceInDays(dRep, dDevis);
          }, 0) / avecReponse.length,
        )
      : 0;

  /** Période précédente (même durée, juste avant) pour la comparaison du taux. */
  const previousDateLimit = dateLimit ? subDays(dateLimit, parseInt(periode)) : null;
  const previous = devisList.filter((d) => {
    if (!dateLimit || !previousDateLimit) return false;
    const dd = d.dateDevis ? new Date(d.dateDevis) : null;
    return !!dd && dd >= previousDateLimit && dd < dateLimit;
  });
  const prevAcceptes = previous.filter((d) => d.statut === "accepte").length;
  const prevTraites = previous.filter((d) => d.statut === "accepte" || d.statut === "refuse").length;
  const prevTaux = prevTraites > 0 ? (prevAcceptes / prevTraites) * 100 : 0;
  const evolutionTaux = tauxConversion - prevTaux;

  return {
    total,
    acceptes,
    refuses,
    envoyes,
    brouillons,
    expires,
    tauxConversion,
    montantTotal,
    montantAccepte,
    montantEnAttente,
    montantPerdu,
    montantMoyen,
    delaiMoyen,
    avecReponseCount: avecReponse.length,
    evolutionTaux,
  };
}
