// Ajout de `n` mois avec clamp de fin de mois (équivalent relativedelta — parité legacy
// `addMonthsClamped`) : évite le débordement (31 jan + 1 mois → 28/29 fév, pas 2/3 mars). Pur.
// Home partagé clean-archi (réutilisé par previsions/trésorerie, contrats récurrents…).
export function addMonthsClamped(base: Date, n: number): Date {
  const day = base.getDate();
  const r = new Date(base);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const lastDayOfTargetMonth = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDayOfTargetMonth));
  return r;
}
