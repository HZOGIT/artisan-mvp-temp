/*
 * round2 : arrondi à 2 décimales avec correction epsilon (style Odoo float_round).
 * Corrige les erreurs de représentation IEEE-754 telles que :
 *   Math.round(1.005 * 100) = 100  →  round2(1.005) = 1.01
 * Epsilon = 2^(floor(log2|n|) − 50), signé selon le signe de n.
 */
export function round2(n: number): number {
  if (n === 0) return 0;
  const eps = Math.sign(n) * Math.pow(2, Math.floor(Math.log2(Math.abs(n))) - 50);
  return Math.round((n + eps) * 100) / 100;
}
