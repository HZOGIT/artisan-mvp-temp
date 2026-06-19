/*
 * Calcul de l'encours client (reste dû des factures émises non soldées) — PUR, testable
 * sans DB. ⚠️ Domaine sensible (montants) : parité stricte avec le legacy.
 * 
 * Règles (parité legacy) :
 * - seules les factures `envoyee`/`en_retard` comptent (pas brouillon/validee = pas encore
 *   une créance ; pas payee/annulee = soldée/sans effet) ;
 * - reste dû d'une facture = `totalTTC − montantPaye`, ignoré si ≤ 0 ;
 * - les avoirs (`typeDocument='avoir'`, totalTTC négatif) NON annulés/brouillon réduisent
 *   l'encours (crédit = somme des valeurs absolues), déduit globalement (planché à 0) ;
 * - part « échue » = factures `en_retard` OU `dateEcheance < now`, bornée au net dû.
 */

export interface FactureEncoursLigne {
  readonly clientId: number;
  readonly statut: string;
  readonly totalTTC: string | null;
  readonly montantPaye: string | null;
  readonly dateEcheance: Date | null;
  readonly typeDocument: string | null;
}

export interface EncoursClient {
  readonly encoursTotal: string; // decimal string à 2 décimales
  readonly echu: string;
  readonly nbFacturesImpayees: number;
}

const num = (v: string | null): number => parseFloat(String(v ?? "0")) || 0;

// Encours d'UN client à partir de ses lignes de factures.
export function calculerEncours(rows: readonly FactureEncoursLigne[], now: number): EncoursClient {
  let encoursTotal = 0;
  let echu = 0;
  let nb = 0;
  let creditAvoirs = 0;
  for (const f of rows) {
    if ((f.typeDocument || "facture") === "avoir") {
      if (f.statut !== "annulee" && f.statut !== "brouillon") {
        creditAvoirs += Math.abs(num(f.totalTTC));
      }
      continue;
    }
    if (f.statut !== "envoyee" && f.statut !== "en_retard") continue;
    const reste = num(f.totalTTC) - num(f.montantPaye);
    if (reste <= 0) continue;
    encoursTotal += reste;
    nb += 1;
    const echeance = f.dateEcheance ? f.dateEcheance.getTime() : NaN;
    const estEchue = f.statut === "en_retard" || (!Number.isNaN(echeance) && echeance < now);
    if (estEchue) echu += reste;
  }
  encoursTotal = Math.max(0, encoursTotal - creditAvoirs);
  echu = Math.min(echu, encoursTotal);
  return { encoursTotal: encoursTotal.toFixed(2), echu: echu.toFixed(2), nbFacturesImpayees: nb };
}

/*
 * Encours de tous les clients du tenant (agrégat par clientId). Ne retourne que les clients
 * réellement débiteurs (encoursTotal > 0), comme le legacy.
 */
export function calculerEncoursParClient(
  rows: readonly FactureEncoursLigne[],
  now: number,
): Record<number, EncoursClient> {
  const parClient = new Map<number, FactureEncoursLigne[]>();
  for (const f of rows) {
    const list = parClient.get(f.clientId) ?? [];
    list.push(f);
    parClient.set(f.clientId, list);
  }
  const out: Record<number, EncoursClient> = {};
  for (const [cid, list] of Array.from(parClient.entries())) {
    const enc = calculerEncours(list, now);
    if (Number(enc.encoursTotal) <= 0) continue;
    out[cid] = enc;
  }
  return out;
}
