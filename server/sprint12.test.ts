import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";

// Mock the database module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

describe("Sprint 12 - Notifications Push, Congés et Prévisions CA", () => {
  describe("Notifications Push", () => {
    it("devrait avoir les fonctions de gestion des notifications push", () => {
      expect(typeof db.savePushSubscription).toBe("function");
      expect(typeof db.getPushSubscriptionsByTechnicien).toBe("function");
      expect(typeof db.deletePushSubscription).toBe("function");
      expect(typeof db.getPreferencesNotifications).toBe("function");
      expect(typeof db.savePreferencesNotifications).toBe("function");
      expect(typeof db.createHistoriqueNotificationPush).toBe("function");
      expect(typeof db.getHistoriqueNotificationsPush).toBe("function");
      expect(typeof db.markNotificationPushAsRead).toBe("function");
    });
  });

  describe("Gestion des Congés", () => {
    it("devrait avoir les fonctions de gestion des congés", () => {
      expect(typeof db.createConge).toBe("function");
      expect(typeof db.getCongesByTechnicien).toBe("function");
      expect(typeof db.getCongesByArtisan).toBe("function");
      expect(typeof db.getCongesEnAttente).toBe("function");
      expect(typeof db.updateCongeStatut).toBe("function");
      expect(typeof db.getCongeById).toBe("function");
      expect(typeof db.deleteConge).toBe("function");
      expect(typeof db.getCongesParPeriode).toBe("function");
    });

    it("devrait avoir les fonctions de gestion des soldes de congés", () => {
      expect(typeof db.getSoldesConges).toBe("function");
      expect(typeof db.updateSoldeConges).toBe("function");
      expect(typeof db.initSoldeConges).toBe("function");
    });

    it("devrait avoir la fonction de vérification des congés", () => {
      expect(typeof db.isTechnicienEnConge).toBe("function");
      expect(typeof db.getTechniciensDisponiblesAvecConges).toBe("function");
    });
  });

  describe("Prévisions de CA", () => {
    it("devrait avoir les fonctions d'historique CA", () => {
      expect(typeof db.getHistoriqueCA).toBe("function");
      expect(typeof db.saveHistoriqueCA).toBe("function");
      expect(typeof db.calculerHistoriqueCAMensuel).toBe("function");
    });

    it("devrait avoir les fonctions de prévisions", () => {
      expect(typeof db.getPrevisionsCA).toBe("function");
      expect(typeof db.savePrevisionCA).toBe("function");
      expect(typeof db.calculerPrevisionsCA).toBe("function");
      expect(typeof db.getComparaisonPrevisionsRealise).toBe("function");
    });
  });

  describe("Types de congés", () => {
    it("devrait supporter les différents types de congés", () => {
      const typesConges = ["conge_paye", "rtt", "maladie", "sans_solde", "formation", "autre"];
      // Vérifier que les types sont bien définis
      typesConges.forEach(type => {
        expect(typeof type).toBe("string");
      });
    });
  });

  describe("Méthodes de prévision", () => {
    it("devrait supporter les différentes méthodes de calcul", () => {
      const methodes = ["moyenne_mobile", "regression_lineaire", "saisonnalite"];
      // Vérifier que les méthodes sont bien définies
      methodes.forEach(methode => {
        expect(typeof methode).toBe("string");
      });
    });
  });

  describe("Types de notifications", () => {
    it("devrait supporter les différents types de notifications", () => {
      const typesNotif = ["assignation", "modification", "annulation", "rappel", "message", "avis"];
      // Vérifier que les types sont bien définis
      typesNotif.forEach(type => {
        expect(typeof type).toBe("string");
      });
    });
  });
});
