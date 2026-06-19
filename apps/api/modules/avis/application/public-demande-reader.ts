/*
 * Lecture PUBLIQUE (par token) d'une demande d'avis — surface portail sans cookie tenant. Le token
 * EST la capacité (cf. RLS `public_token_select`). Renvoie le strict nécessaire ; null si le token
 * ne correspond à aucune demande (anti-oracle : l'appelant renvoie un not-found uniforme).
 */
export interface DemandeAvisPublic {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly interventionId: number;
  readonly statut: string; // "envoyee" | "ouverte" | "completee" | "expiree"
  readonly expiresAt: Date;
}

export interface PublicDemandeAvisReader {
  getByToken(token: string): Promise<DemandeAvisPublic | null>;
}
