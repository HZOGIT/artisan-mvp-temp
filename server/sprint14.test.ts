import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("Sprint 14 - Chantiers, Intégrations Comptables et Devis IA", () => {
  describe("Module de gestion des chantiers", () => {
    it("devrait avoir une fonction pour créer un chantier", () => {
      expect(typeof db.createChantier).toBe("function");
    });

    it("devrait avoir une fonction pour lister les chantiers par artisan", () => {
      expect(typeof db.getChantiersByArtisan).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer un chantier par ID", () => {
      expect(typeof db.getChantierById).toBe("function");
    });

    it("devrait avoir une fonction pour mettre à jour un chantier", () => {
      expect(typeof db.updateChantier).toBe("function");
    });

    it("devrait avoir une fonction pour supprimer un chantier", () => {
      expect(typeof db.deleteChantier).toBe("function");
    });

    it("devrait avoir une fonction pour créer une phase de chantier", () => {
      expect(typeof db.createPhaseChantier).toBe("function");
    });

    it("devrait avoir une fonction pour lister les phases d'un chantier", () => {
      expect(typeof db.getPhasesByChantier).toBe("function");
    });

    it("devrait avoir une fonction pour mettre à jour une phase", () => {
      expect(typeof db.updatePhaseChantier).toBe("function");
    });

    it("devrait avoir une fonction pour supprimer une phase", () => {
      expect(typeof db.deletePhaseChantier).toBe("function");
    });

    it("devrait avoir une fonction pour associer une intervention à un chantier", () => {
      expect(typeof db.associerInterventionChantier).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les interventions d'un chantier", () => {
      expect(typeof db.getInterventionsByChantier).toBe("function");
    });

    it("devrait avoir une fonction pour calculer l'avancement d'un chantier", () => {
      expect(typeof db.calculerAvancementChantier).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les statistiques d'un chantier", () => {
      expect(typeof db.getStatistiquesChantier).toBe("function");
    });
  });

  describe("Intégrations comptables", () => {
    it("devrait avoir une fonction pour sauvegarder la configuration comptable", () => {
      expect(typeof db.saveConfigurationComptable).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer la configuration comptable", () => {
      expect(typeof db.getConfigurationComptable).toBe("function");
    });

    it("devrait avoir une fonction pour créer un export comptable", () => {
      expect(typeof db.createExportComptable).toBe("function");
    });

    it("devrait avoir une fonction pour lister les exports comptables", () => {
      expect(typeof db.getExportsComptables).toBe("function");
    });

    it("devrait avoir une fonction pour mettre à jour un export comptable", () => {
      expect(typeof db.updateExportComptable).toBe("function");
    });

    it("devrait avoir une fonction pour générer le format FEC (Sage)", () => {
      expect(typeof db.genererExportFEC).toBe("function");
    });

    it("devrait avoir une fonction pour générer le format IIF (QuickBooks)", () => {
      expect(typeof db.genererExportIIF).toBe("function");
    });
  });

  describe("Devis automatique IA", () => {
    it("devrait avoir une fonction pour créer une analyse photo", () => {
      expect(typeof db.createAnalysePhoto).toBe("function");
    });

    it("devrait avoir une fonction pour lister les analyses par artisan", () => {
      expect(typeof db.getAnalysesPhotosByArtisan).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer une analyse par ID", () => {
      expect(typeof db.getAnalysePhotoById).toBe("function");
    });

    it("devrait avoir une fonction pour mettre à jour une analyse", () => {
      expect(typeof db.updateAnalysePhoto).toBe("function");
    });

    it("devrait avoir une fonction pour ajouter une photo à l'analyse", () => {
      expect(typeof db.addPhotoToAnalyse).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les photos d'une analyse", () => {
      expect(typeof db.getPhotosByAnalyse).toBe("function");
    });

    it("devrait avoir une fonction pour sauvegarder les résultats de l'analyse", () => {
      expect(typeof db.saveResultatAnalyseIA).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les résultats d'une analyse", () => {
      expect(typeof db.getResultatsAnalyse).toBe("function");
    });

    it("devrait avoir une fonction pour sauvegarder les suggestions d'articles", () => {
      expect(typeof db.saveSuggestionArticleIA).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les suggestions par résultat", () => {
      expect(typeof db.getSuggestionsByResultat).toBe("function");
    });

    it("devrait avoir une fonction pour mettre à jour une suggestion", () => {
      expect(typeof db.updateSuggestionArticle).toBe("function");
    });

    it("devrait avoir une fonction pour créer un devis depuis l'analyse", () => {
      expect(typeof db.creerDevisDepuisAnalyseIA).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer le devis généré par analyse", () => {
      expect(typeof db.getDevisGenereByAnalyse).toBe("function");
    });
  });
});
