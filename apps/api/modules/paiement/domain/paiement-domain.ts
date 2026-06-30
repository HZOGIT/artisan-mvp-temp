export type PaiementStatut = "en_attente" | "payee" | "echouee" | "remboursee" | "expire";

export interface PaiementStripe {
  readonly id: number;
  readonly factureId: number;
  readonly stripeSessionId: string;
  readonly montant: string;
  readonly statut: PaiementStatut;
  readonly lienPaiement: string | null;
  readonly tokenPaiement: string;
  readonly paidAt: Date | null;
}
