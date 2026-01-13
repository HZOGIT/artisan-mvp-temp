import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('./db', () => ({
  getFournisseursByArtisan: vi.fn(),
  getFournisseurById: vi.fn(),
  createFournisseur: vi.fn(),
  updateFournisseur: vi.fn(),
  deleteFournisseur: vi.fn(),
  getArticleFournisseurs: vi.fn(),
  getFournisseurArticles: vi.fn(),
  createArticleFournisseur: vi.fn(),
  deleteArticleFournisseur: vi.fn(),
  getArtisanByUserId: vi.fn(),
  createSmsVerification: vi.fn(),
  getSmsVerificationBySignature: vi.fn(),
  verifySmsCode: vi.fn(),
  getSignatureByToken: vi.fn(),
}));

import * as db from './db';

describe('Fournisseurs Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFournisseursByArtisan', () => {
    it('should return fournisseurs for a given artisan', async () => {
      const mockFournisseurs = [
        { id: 1, artisanId: 1, nom: 'Rexel', contact: 'Jean Dupont', email: 'contact@rexel.fr' },
        { id: 2, artisanId: 1, nom: 'Point P', contact: 'Marie Martin', email: 'contact@pointp.fr' },
      ];
      
      vi.mocked(db.getFournisseursByArtisan).mockResolvedValue(mockFournisseurs as any);
      
      const result = await db.getFournisseursByArtisan(1);
      
      expect(result).toEqual(mockFournisseurs);
      expect(db.getFournisseursByArtisan).toHaveBeenCalledWith(1);
    });

    it('should return empty array when no fournisseurs exist', async () => {
      vi.mocked(db.getFournisseursByArtisan).mockResolvedValue([]);
      
      const result = await db.getFournisseursByArtisan(999);
      
      expect(result).toEqual([]);
    });
  });

  describe('createFournisseur', () => {
    it('should create a new fournisseur', async () => {
      const newFournisseur = {
        artisanId: 1,
        nom: 'Nouveau Fournisseur',
        contact: 'Test Contact',
        email: 'test@fournisseur.fr',
        telephone: '0123456789',
      };
      
      vi.mocked(db.createFournisseur).mockResolvedValue(1);
      
      const result = await db.createFournisseur(newFournisseur as any);
      
      expect(result).toBe(1);
      expect(db.createFournisseur).toHaveBeenCalledWith(newFournisseur);
    });
  });

  describe('updateFournisseur', () => {
    it('should update an existing fournisseur', async () => {
      vi.mocked(db.updateFournisseur).mockResolvedValue(undefined);
      
      await db.updateFournisseur(1, { nom: 'Updated Name' });
      
      expect(db.updateFournisseur).toHaveBeenCalledWith(1, { nom: 'Updated Name' });
    });
  });

  describe('deleteFournisseur', () => {
    it('should delete a fournisseur', async () => {
      vi.mocked(db.deleteFournisseur).mockResolvedValue(undefined);
      
      await db.deleteFournisseur(1);
      
      expect(db.deleteFournisseur).toHaveBeenCalledWith(1);
    });
  });
});

describe('Article-Fournisseur Associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getArticleFournisseurs', () => {
    it('should return fournisseurs for a given article', async () => {
      const mockAssociations = [
        { id: 1, articleId: 1, fournisseurId: 1, referenceExterne: 'REF-001', prixAchat: '10.00' },
        { id: 2, articleId: 1, fournisseurId: 2, referenceExterne: 'REF-002', prixAchat: '12.00' },
      ];
      
      vi.mocked(db.getArticleFournisseurs).mockResolvedValue(mockAssociations as any);
      
      const result = await db.getArticleFournisseurs(1);
      
      expect(result).toEqual(mockAssociations);
      expect(db.getArticleFournisseurs).toHaveBeenCalledWith(1);
    });
  });

  describe('getFournisseurArticles', () => {
    it('should return articles for a given fournisseur', async () => {
      const mockAssociations = [
        { id: 1, articleId: 1, fournisseurId: 1, referenceExterne: 'REF-001' },
        { id: 2, articleId: 2, fournisseurId: 1, referenceExterne: 'REF-002' },
      ];
      
      vi.mocked(db.getFournisseurArticles).mockResolvedValue(mockAssociations as any);
      
      const result = await db.getFournisseurArticles(1);
      
      expect(result).toEqual(mockAssociations);
      expect(db.getFournisseurArticles).toHaveBeenCalledWith(1);
    });
  });

  describe('createArticleFournisseur', () => {
    it('should create an article-fournisseur association', async () => {
      const newAssociation = {
        articleId: 1,
        fournisseurId: 1,
        referenceExterne: 'REF-EXT-001',
        prixAchat: '15.00',
        delaiLivraison: 3,
      };
      
      vi.mocked(db.createArticleFournisseur).mockResolvedValue(1);
      
      const result = await db.createArticleFournisseur(newAssociation as any);
      
      expect(result).toBe(1);
      expect(db.createArticleFournisseur).toHaveBeenCalledWith(newAssociation);
    });
  });

  describe('deleteArticleFournisseur', () => {
    it('should delete an article-fournisseur association', async () => {
      vi.mocked(db.deleteArticleFournisseur).mockResolvedValue(undefined);
      
      await db.deleteArticleFournisseur(1);
      
      expect(db.deleteArticleFournisseur).toHaveBeenCalledWith(1);
    });
  });
});

describe('SMS Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSmsVerification', () => {
    it('should create an SMS verification record', async () => {
      const verification = {
        signatureId: 1,
        telephone: '0612345678',
        code: '123456',
        expiresAt: new Date(Date.now() + 600000), // 10 minutes
      };
      
      vi.mocked(db.createSmsVerification).mockResolvedValue(1);
      
      const result = await db.createSmsVerification(verification as any);
      
      expect(result).toBe(1);
      expect(db.createSmsVerification).toHaveBeenCalledWith(verification);
    });
  });

  describe('getSmsVerificationBySignature', () => {
    it('should return the latest SMS verification for a signature', async () => {
      const mockVerification = {
        id: 1,
        signatureId: 1,
        telephone: '0612345678',
        code: '123456',
        verified: false,
        expiresAt: new Date(Date.now() + 600000),
      };
      
      vi.mocked(db.getSmsVerificationBySignature).mockResolvedValue(mockVerification as any);
      
      const result = await db.getSmsVerificationBySignature(1);
      
      expect(result).toEqual(mockVerification);
      expect(db.getSmsVerificationBySignature).toHaveBeenCalledWith(1);
    });

    it('should return undefined when no verification exists', async () => {
      vi.mocked(db.getSmsVerificationBySignature).mockResolvedValue(undefined);
      
      const result = await db.getSmsVerificationBySignature(999);
      
      expect(result).toBeUndefined();
    });
  });

  describe('verifySmsCode', () => {
    it('should return true for valid code', async () => {
      vi.mocked(db.verifySmsCode).mockResolvedValue(true);
      
      const result = await db.verifySmsCode(1, '123456');
      
      expect(result).toBe(true);
      expect(db.verifySmsCode).toHaveBeenCalledWith(1, '123456');
    });

    it('should return false for invalid code', async () => {
      vi.mocked(db.verifySmsCode).mockResolvedValue(false);
      
      const result = await db.verifySmsCode(1, '000000');
      
      expect(result).toBe(false);
    });

    it('should return false for expired code', async () => {
      vi.mocked(db.verifySmsCode).mockResolvedValue(false);
      
      const result = await db.verifySmsCode(1, '123456');
      
      expect(result).toBe(false);
    });
  });
});

describe('SMS Code Generation', () => {
  it('should generate a 6-digit code', () => {
    const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();
    
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(parseInt(code)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(code)).toBeLessThanOrEqual(999999);
    }
  });
});

describe('Phone Number Validation', () => {
  it('should validate French phone numbers', () => {
    const phoneRegex = /^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;
    
    // Valid numbers
    expect(phoneRegex.test('0612345678')).toBe(true);
    expect(phoneRegex.test('06 12 34 56 78')).toBe(true);
    expect(phoneRegex.test('+33612345678')).toBe(true);
    expect(phoneRegex.test('+33 6 12 34 56 78')).toBe(true);
    expect(phoneRegex.test('0033612345678')).toBe(true);
    
    // Invalid numbers
    expect(phoneRegex.test('123456')).toBe(false);
    expect(phoneRegex.test('abcdefghij')).toBe(false);
    expect(phoneRegex.test('')).toBe(false);
  });
});
