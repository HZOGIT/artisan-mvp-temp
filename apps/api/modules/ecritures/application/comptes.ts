// Plan comptable (PCG) minimal pour les écritures de vente — PUR, testable. Parité legacy
// `compteTvaCollectee`. Comptes : 411 Clients, 706 Prestations, 445 TVA collectée ventilée.

export interface Compte {
  readonly compte: string;
  readonly lib: string;
}

export const COMPTE_CLIENT: Compte = { compte: "411000", lib: "Clients" };
export const COMPTE_VENTES: Compte = { compte: "706000", lib: "Prestations de services" };
export const COMPTE_BANQUE: Compte = { compte: "512000", lib: "Banque" };

// TVA collectée selon le taux (parité legacy : seuils décroissants). 20→445711, 10→445712,
// 5,5→445713, 2,1→445714 ; repli 445711.
export function compteTvaCollectee(taux: number): Compte {
  if (taux >= 19.5) return { compte: "445711", lib: "TVA collectée 20%" };
  if (taux >= 9.5) return { compte: "445712", lib: "TVA collectée 10%" };
  if (taux >= 5) return { compte: "445713", lib: "TVA collectée 5,5%" };
  if (taux >= 2) return { compte: "445714", lib: "TVA collectée 2,1%" };
  return { compte: "445711", lib: "TVA collectée" };
}
