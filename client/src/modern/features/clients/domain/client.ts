import type { components } from "@/modern/shared/api/schema";

// Type de domaine FRONT du client, dérivé du contrat OpenAPI (source de vérité unique côté serveur).
// On réexpose le type généré sous un nom métier : la couche application/UI dépend de `Client`, pas du
// nom technique `components["schemas"]["Client"]` (découplage du transport).
export type Client = components["schemas"]["Client"];

// Règle de domaine pure (testable sans réseau) : libellé d'affichage d'un client.
export function nomComplet(c: Pick<Client, "nom" | "prenom" | "raisonSociale">): string {
  if (c.raisonSociale) return c.raisonSociale;
  return [c.prenom, c.nom].filter(Boolean).join(" ").trim() || c.nom;
}
