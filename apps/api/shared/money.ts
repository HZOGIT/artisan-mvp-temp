/**
 * Module money : utilitaires d'arrondi et de comparaison pour montants en EUR.
 *
 * Arrondi : round_per_line (chaque ligne indépendante) selon Odoo company.tax_calculation_rounding_method.
 * Sur 3 lignes à 33.33€ HT + 20% TVA : somme TVA = 20.01€ (round_per_line) vs 20.00€ (round_globally).
 * Différence légale en France ; cohérent avec FEC et imports comptables.
 *
 * Comparaisons : tolérance 0.005 (centime) pour éviter pièges IEEE-754 (mêmes principes Odoo float_compare).
 */

/**
 * Arrondi à 2 décimales avec correction epsilon (style Odoo float_round).
 * Corrige les erreurs de représentation IEEE-754 telles que :
 *   Math.round(1.005 * 100) = 100  →  round2(1.005) = 1.01
 * Epsilon = 2^(floor(log2|n|) − 50), signé selon le signe de n.
 */
export function round2(n: number): number {
  if (n === 0) return 0;
  const eps = Math.sign(n) * Math.pow(2, Math.floor(Math.log2(Math.abs(n))) - 50);
  return Math.round((n + eps) * 100) / 100;
}

/** Compare deux montants monétaires (tolérance 0.005). */
export const compareAmounts = (a: number, b: number): -1 | 0 | 1 =>
  Math.abs(a - b) < 0.005 ? 0 : a < b ? -1 : 1;

/** Vrai si le montant est nul au centime près. */
export const isZeroAmount = (n: number): boolean => Math.abs(n) < 0.005;
