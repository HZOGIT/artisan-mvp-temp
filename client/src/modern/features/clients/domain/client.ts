import type { RouterOutputs } from "@/modern/shared/trpc";

// Type de domaine FRONT du client, dérivé des sorties du routeur tRPC (source de vérité unique côté
// serveur — zod → AppRouter). La couche application/UI dépend de `Client`, pas du transport.
export type Client = RouterOutputs["clients"]["list"][number];

// Règle de domaine pure (testable sans réseau) : libellé d'affichage d'un client.
export function nomComplet(c: Pick<Client, "nom" | "prenom" | "raisonSociale">): string {
  if (c.raisonSociale) return c.raisonSociale;
  return [c.prenom, c.nom].filter(Boolean).join(" ").trim() || c.nom;
}
