// Configuration des produits Stripe pour le paiement des factures
// Les factures sont des paiements uniques, pas des abonnements

export interface StripeProduct {
  name: string;
  description: string;
}

// Pour les factures, nous créons des sessions de paiement dynamiques
// basées sur le montant de chaque facture
export const STRIPE_CONFIG = {
  currency: 'eur',
  paymentMethods: ['card', 'sepa_debit'] as const,
  locale: 'fr' as const,
};

// Fonction pour générer le nom du produit pour une facture
export function getInvoiceProductName(numeroFacture: string): string {
  return `Facture ${numeroFacture}`;
}

// Fonction pour générer la description du produit
export function getInvoiceProductDescription(clientName: string, artisanName: string): string {
  return `Paiement de facture pour ${clientName} - ${artisanName}`;
}
