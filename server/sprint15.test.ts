import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("Sprint 15 - Améliorations", () => {
  describe("Amélioration Devis IA - Modification Manuelle", () => {
    it("devrait avoir une fonction pour mettre à jour les suggestions d'articles", () => {
      expect(typeof db.updateSuggestionArticle).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les suggestions par résultat", () => {
      expect(typeof db.getSuggestionsByResultat).toBe("function");
    });

    it("devrait avoir une fonction pour créer un devis depuis l'analyse IA", () => {
      expect(typeof db.creerDevisDepuisAnalyseIA).toBe("function");
    });
  });

  describe("Calendrier Partagé des Chantiers", () => {
    it("devrait avoir une fonction pour récupérer les chantiers par artisan", () => {
      expect(typeof db.getChantiersByArtisan).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les interventions par chantier", () => {
      expect(typeof db.getInterventionsByChantier).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer toutes les associations interventions-chantiers", () => {
      expect(typeof db.getAllInterventionsChantier).toBe("function");
    });

    it("devrait avoir une fonction pour associer une intervention à un chantier", () => {
      expect(typeof db.associerInterventionChantier).toBe("function");
    });

    it("devrait avoir une fonction pour dissocier une intervention d'un chantier", () => {
      expect(typeof db.dissocierInterventionChantier).toBe("function");
    });
  });

  describe("Synchronisation Automatique Comptable", () => {
    it("devrait avoir une fonction pour sauvegarder la configuration de synchronisation", () => {
      expect(typeof db.saveSyncConfigComptable).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les logs de synchronisation", () => {
      expect(typeof db.getSyncLogsComptables).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les éléments en attente", () => {
      expect(typeof db.getPendingItemsComptables).toBe("function");
    });

    it("devrait avoir une fonction pour lancer la synchronisation", () => {
      expect(typeof db.lancerSynchronisationComptable).toBe("function");
    });

    it("devrait avoir une fonction pour réessayer la synchronisation d'un élément", () => {
      expect(typeof db.retrySyncItem).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer la configuration comptable", () => {
      expect(typeof db.getConfigurationComptable).toBe("function");
    });

    it("devrait avoir une fonction pour sauvegarder la configuration comptable", () => {
      expect(typeof db.saveConfigurationComptable).toBe("function");
    });

    it("devrait avoir une fonction pour générer l'export FEC", () => {
      expect(typeof db.genererExportFEC).toBe("function");
    });

    it("devrait avoir une fonction pour générer l'export IIF", () => {
      expect(typeof db.genererExportIIF).toBe("function");
    });
  });

  describe("Intégration des fonctionnalités", () => {
    it("devrait avoir une fonction pour créer un export comptable", () => {
      expect(typeof db.createExportComptable).toBe("function");
    });

    it("devrait avoir une fonction pour mettre à jour un export comptable", () => {
      expect(typeof db.updateExportComptable).toBe("function");
    });

    it("devrait avoir une fonction pour récupérer les exports comptables", () => {
      expect(typeof db.getExportsComptables).toBe("function");
    });
  });
});
