// Registre des domaines effectivement portés sur le nouveau stack (clean-archi) et
// montés dans `createAppRouter`. Sert de garde-fou pour la bascule : un flag ne devrait
// cibler qu'un domaine présent ici (sinon le routage enverrait vers un domaine inexistant
// du nouveau stack). Mis à jour à chaque domaine livré (étape 9/9 du gabarit).
export const MIGRATED_DOMAINS = ["vehicules", "avis", "badges", "techniciens", "notifications", "fournisseurs", "commandes", "stocks", "clients", "interventions", "conges", "notesDeFrais", "chantiers", "depenses", "devis", "factures", "ecritures"] as const;

export type MigratedDomain = (typeof MIGRATED_DOMAINS)[number];

// Le domaine est-il monté dans le nouveau stack (donc éligible à une bascule de flag) ?
export function isMigratedDomainAvailable(domain: string): domain is MigratedDomain {
  return (MIGRATED_DOMAINS as readonly string[]).includes(domain);
}
