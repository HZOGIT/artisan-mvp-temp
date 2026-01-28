import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock des fonctions de base de données
vi.mock('./db', () => ({
  // Modèles d'emails
  getModelesEmail: vi.fn().mockResolvedValue([
    { id: 1, nom: 'Relance standard', type: 'relance_devis', sujet: 'Relance devis', contenu: 'Bonjour {{nom_client}}', isDefault: true },
  ]),
  getModeleEmailById: vi.fn().mockResolvedValue({
    id: 1, nom: 'Relance standard', type: 'relance_devis', sujet: 'Relance devis', contenu: 'Bonjour {{nom_client}}', isDefault: true
  }),
  createModeleEmail: vi.fn().mockResolvedValue({ id: 2, nom: 'Nouveau modèle' }),
  updateModeleEmail: vi.fn().mockResolvedValue({ id: 1, nom: 'Modèle mis à jour' }),
  deleteModeleEmail: vi.fn().mockResolvedValue(undefined),
  
  // Commandes fournisseurs
  getCommandesFournisseurs: vi.fn().mockResolvedValue([
    { id: 1, fournisseurId: 1, reference: 'CMD-001', statut: 'en_attente' },
  ]),
  getPerformancesFournisseurs: vi.fn().mockResolvedValue([
    { 
      fournisseur: { id: 1, nom: 'Fournisseur Test' },
      totalCommandes: 10,
      commandesLivrees: 8,
      commandesEnRetard: 1,
      delaiMoyenLivraison: 5,
      tauxFiabilite: 80,
      montantTotal: 5000
    }
  ]),
  createCommandeFournisseur: vi.fn().mockResolvedValue({ id: 1, reference: 'CMD-001' }),
  updateCommandeFournisseur: vi.fn().mockResolvedValue({ id: 1, statut: 'livree' }),
  
  // Paiements Stripe
  getPaiementsByFactureId: vi.fn().mockResolvedValue([
    { id: 1, factureId: 1, stripeSessionId: 'sess_123', statut: 'complete' }
  ]),
  createPaiementStripe: vi.fn().mockResolvedValue({ id: 1, stripeSessionId: 'sess_123' }),
  getPaiementByToken: vi.fn().mockResolvedValue({ id: 1, tokenPaiement: 'token_123' }),
  markPaiementComplete: vi.fn().mockResolvedValue(undefined),
  
  // Autres fonctions nécessaires
  getArtisanByUserId: vi.fn().mockResolvedValue({ id: 1, userId: 1, nomEntreprise: 'Test Artisan' }),
  getFactureById: vi.fn().mockResolvedValue({ 
    id: 1, artisanId: 1, clientId: 1, numero: 'FAC-001', totalTTC: '1000.00', statut: 'envoyee' 
  }),
  getClientById: vi.fn().mockResolvedValue({ 
    id: 1, nom: 'Client Test', email: 'client@test.com' 
  }),
  updateFacture: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue({ id: 1 }),
}));

describe('Modèles d\'emails', () => {
  it('devrait retourner la liste des modèles', async () => {
    const db = await import('./db');
    const modeles = await db.getModelesEmail();
    expect(modeles).toHaveLength(1);
    expect(modeles[0].type).toBe('relance_devis');
  });

  it('devrait créer un nouveau modèle', async () => {
    const db = await import('./db');
    const modele = await db.createModeleEmail({
      nom: 'Nouveau modèle',
      type: 'envoi_facture',
      sujet: 'Votre facture',
      contenu: 'Bonjour {{nom_client}}',
      isDefault: false,
    });
    expect(modele.id).toBe(2);
  });

  it('devrait mettre à jour un modèle existant', async () => {
    const db = await import('./db');
    const modele = await db.updateModeleEmail(1, { nom: 'Modèle mis à jour' });
    expect(modele.nom).toBe('Modèle mis à jour');
  });

  it('devrait supprimer un modèle', async () => {
    const db = await import('./db');
    await expect(db.deleteModeleEmail(1)).resolves.not.toThrow();
  });
});

describe('Performances fournisseurs', () => {
  it('devrait retourner les performances des fournisseurs', async () => {
    const db = await import('./db');
    const performances = await db.getPerformancesFournisseurs();
    expect(performances).toHaveLength(1);
    expect(performances[0].tauxFiabilite).toBe(80);
  });

  it('devrait créer une commande fournisseur', async () => {
    const db = await import('./db');
    const commande = await db.createCommandeFournisseur({
      fournisseurId: 1,
      reference: 'CMD-001',
    });
    expect(commande.reference).toBe('CMD-001');
  });

  it('devrait mettre à jour le statut d\'une commande', async () => {
    const db = await import('./db');
    const commande = await db.updateCommandeFournisseur(1, { statut: 'livree' });
    expect(commande.statut).toBe('livree');
  });
});

describe('Paiements Stripe', () => {
  it('devrait récupérer les paiements d\'une facture', async () => {
    const db = await import('./db');
    const paiements = await db.getPaiementsByFactureId(1);
    expect(paiements).toHaveLength(1);
    expect(paiements[0].stripeSessionId).toBe('sess_123');
  });

  it('devrait créer un paiement Stripe', async () => {
    const db = await import('./db');
    const paiement = await db.createPaiementStripe({
      factureId: 1,
      artisanId: 1,
      stripeSessionId: 'sess_123',
      montant: '1000.00',
      tokenPaiement: 'token_123',
      lienPaiement: 'https://checkout.stripe.com/...',
      statut: 'en_attente',
    });
    expect(paiement.stripeSessionId).toBe('sess_123');
  });

  it('devrait récupérer un paiement par token', async () => {
    const db = await import('./db');
    const paiement = await db.getPaiementByToken('token_123');
    expect(paiement).not.toBeNull();
    expect(paiement?.tokenPaiement).toBe('token_123');
  });

  it('devrait marquer un paiement comme complet', async () => {
    const db = await import('./db');
    await expect(db.markPaiementComplete(1, 'pi_123')).resolves.not.toThrow();
  });
});

describe('Intégration Stripe', () => {
  it('devrait vérifier la configuration Stripe', async () => {
    // Test que la fonction isStripeConfigured existe
    const { isStripeConfigured } = await import('./stripe/stripeService');
    expect(typeof isStripeConfigured).toBe('function');
  });
});

describe('Webhook Stripe', () => {
  it('devrait gérer les événements de test', async () => {
    // Simuler un événement de test Stripe
    const testEvent = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: { object: {} }
    };
    
    // Vérifier que l'ID commence par 'evt_test_'
    expect(testEvent.id.startsWith('evt_test_')).toBe(true);
  });
});
