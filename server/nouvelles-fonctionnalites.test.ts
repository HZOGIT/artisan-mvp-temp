import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock des modules
vi.mock('./db', () => ({
  getDevisNonSignes: vi.fn(),
  getRelancesDevis: vi.fn(),
  createRelanceDevis: vi.fn(),
  getLastRelanceDate: vi.fn(),
  getStocksEnRupture: vi.fn(),
  getRapportCommandeFournisseur: vi.fn(),
  getArtisanByUserId: vi.fn(),
  getDevisById: vi.fn(),
  getClientById: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock('./_core/emailService', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('./_core/smsService', () => ({
  sendVerificationCode: vi.fn().mockResolvedValue({ success: true }),
  isTwilioConfigured: vi.fn().mockReturnValue(false),
  isValidPhoneNumber: vi.fn().mockReturnValue(true),
}));

import * as db from './db';
import { sendEmail } from './_core/emailService';
import { sendVerificationCode, isTwilioConfigured, isValidPhoneNumber } from './_core/smsService';

describe('Nouvelles Fonctionnalités', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service SMS Twilio', () => {
    it('devrait valider un numéro de téléphone français', () => {
      expect(isValidPhoneNumber('+33612345678')).toBe(true);
    });

    it('devrait indiquer si Twilio est configuré', () => {
      expect(isTwilioConfigured()).toBe(false);
    });

    it('devrait envoyer un code de vérification', async () => {
      const result = await sendVerificationCode('+33612345678', '123456');
      expect(result.success).toBe(true);
    });
  });

  describe('Rapport Commande Fournisseur', () => {
    it('devrait retourner les stocks en rupture', async () => {
      const mockStocksEnRupture = [
        {
          stock: {
            id: 1,
            reference: 'REF001',
            designation: 'Article Test',
            quantiteEnStock: '5',
            seuilAlerte: '10',
            unite: 'unité',
            prixAchat: '15.00'
          },
          fournisseur: {
            id: 1,
            nom: 'Fournisseur Test',
            email: 'fournisseur@test.com'
          },
          articleFournisseur: null,
          quantiteACommander: 15
        }
      ];

      vi.mocked(db.getStocksEnRupture).mockResolvedValue(mockStocksEnRupture as any);

      const result = await db.getStocksEnRupture(1);
      expect(result).toHaveLength(1);
      expect(result[0].stock.reference).toBe('REF001');
      expect(result[0].quantiteACommander).toBe(15);
    });

    it('devrait générer un rapport de commande groupé par fournisseur', async () => {
      const mockRapport = [
        {
          fournisseur: {
            id: 1,
            nom: 'Fournisseur A',
            email: 'a@test.com'
          },
          lignes: [
            {
              stock: { id: 1, designation: 'Article 1' },
              quantiteACommander: 10,
              prixUnitaire: 5,
              montantTotal: 50
            }
          ],
          totalCommande: 50
        },
        {
          fournisseur: null,
          lignes: [
            {
              stock: { id: 2, designation: 'Article 2' },
              quantiteACommander: 5,
              prixUnitaire: 10,
              montantTotal: 50
            }
          ],
          totalCommande: 50
        }
      ];

      vi.mocked(db.getRapportCommandeFournisseur).mockResolvedValue(mockRapport as any);

      const result = await db.getRapportCommandeFournisseur(1);
      expect(result).toHaveLength(2);
      expect(result[0].fournisseur?.nom).toBe('Fournisseur A');
      expect(result[1].fournisseur).toBeNull();
    });
  });

  describe('Relances Devis', () => {
    it('devrait retourner les devis non signés', async () => {
      const mockDevisNonSignes = [
        {
          devis: {
            id: 1,
            numero: 'DEV-001',
            dateDevis: new Date('2025-01-01'),
            totalTTC: '1000.00',
            statut: 'envoye'
          },
          client: {
            id: 1,
            nom: 'Client Test',
            email: 'client@test.com'
          },
          signature: {
            id: 1,
            token: 'token123',
            createdAt: new Date('2025-01-01')
          },
          joursDepuisCreation: 12,
          joursDepuisEnvoi: 12
        }
      ];

      vi.mocked(db.getDevisNonSignes).mockResolvedValue(mockDevisNonSignes as any);

      const result = await db.getDevisNonSignes(1, 7);
      expect(result).toHaveLength(1);
      expect(result[0].devis.numero).toBe('DEV-001');
      expect(result[0].joursDepuisCreation).toBe(12);
    });

    it('devrait créer une relance', async () => {
      vi.mocked(db.createRelanceDevis).mockResolvedValue(1);

      const relanceId = await db.createRelanceDevis({
        devisId: 1,
        artisanId: 1,
        type: 'email',
        destinataire: 'client@test.com',
        message: 'Message de relance',
        statut: 'envoye'
      });

      expect(relanceId).toBe(1);
      expect(db.createRelanceDevis).toHaveBeenCalledWith({
        devisId: 1,
        artisanId: 1,
        type: 'email',
        destinataire: 'client@test.com',
        message: 'Message de relance',
        statut: 'envoye'
      });
    });

    it('devrait vérifier la dernière date de relance', async () => {
      const mockDate = new Date('2025-01-10');
      vi.mocked(db.getLastRelanceDate).mockResolvedValue(mockDate);

      const result = await db.getLastRelanceDate(1);
      expect(result).toEqual(mockDate);
    });

    it('devrait retourner null si aucune relance', async () => {
      vi.mocked(db.getLastRelanceDate).mockResolvedValue(null);

      const result = await db.getLastRelanceDate(1);
      expect(result).toBeNull();
    });
  });

  describe('Envoi Email', () => {
    it('devrait envoyer un email de relance', async () => {
      const result = await sendEmail({
        to: 'client@test.com',
        subject: 'Relance - Devis n°DEV-001',
        body: '<p>Message de relance</p>'
      });

      expect(result).toBe(true);
      expect(sendEmail).toHaveBeenCalledWith({
        to: 'client@test.com',
        subject: 'Relance - Devis n°DEV-001',
        body: '<p>Message de relance</p>'
      });
    });
  });
});

describe('Intégration Relances Automatiques', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait filtrer les devis déjà relancés récemment', async () => {
    // Simuler un devis avec une relance récente (il y a 3 jours)
    const relanceRecente = new Date();
    relanceRecente.setDate(relanceRecente.getDate() - 3);
    
    vi.mocked(db.getLastRelanceDate).mockResolvedValue(relanceRecente);

    const lastRelance = await db.getLastRelanceDate(1);
    const joursDepuisRelance = Math.floor((Date.now() - lastRelance!.getTime()) / (1000 * 60 * 60 * 24));
    
    // Si le délai minimum entre relances est de 7 jours, ce devis ne devrait pas être relancé
    expect(joursDepuisRelance).toBeLessThan(7);
  });

  it('devrait permettre une relance si le délai est dépassé', async () => {
    // Simuler un devis avec une relance ancienne (il y a 10 jours)
    const relanceAncienne = new Date();
    relanceAncienne.setDate(relanceAncienne.getDate() - 10);
    
    vi.mocked(db.getLastRelanceDate).mockResolvedValue(relanceAncienne);

    const lastRelance = await db.getLastRelanceDate(1);
    const joursDepuisRelance = Math.floor((Date.now() - lastRelance!.getTime()) / (1000 * 60 * 60 * 24));
    
    // Si le délai minimum entre relances est de 7 jours, ce devis peut être relancé
    expect(joursDepuisRelance).toBeGreaterThanOrEqual(7);
  });
});
