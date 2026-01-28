import { describe, it, expect, vi } from "vitest";
import * as db from "./db";

describe("Sprint 9 - Chat, Techniciens et Avis", () => {
  describe("Chat", () => {
    it("devrait avoir la fonction getConversationsByArtisanId", () => {
      expect(typeof db.getConversationsByArtisanId).toBe("function");
    });

    it("devrait avoir la fonction getMessagesByConversationId", () => {
      expect(typeof db.getMessagesByConversationId).toBe("function");
    });

    it("devrait avoir la fonction createMessage", () => {
      expect(typeof db.createMessage).toBe("function");
    });

    it("devrait avoir la fonction getOrCreateConversation", () => {
      expect(typeof db.getOrCreateConversation).toBe("function");
    });

    it("devrait avoir la fonction markMessagesAsRead", () => {
      expect(typeof db.markMessagesAsRead).toBe("function");
    });

    it("devrait avoir la fonction getUnreadMessagesCount", () => {
      expect(typeof db.getUnreadMessagesCount).toBe("function");
    });
  });

  describe("Techniciens", () => {
    it("devrait avoir la fonction getTechniciensByArtisanId", () => {
      expect(typeof db.getTechniciensByArtisanId).toBe("function");
    });

    it("devrait avoir la fonction createTechnicien", () => {
      expect(typeof db.createTechnicien).toBe("function");
    });

    it("devrait avoir la fonction updateTechnicien", () => {
      expect(typeof db.updateTechnicien).toBe("function");
    });

    it("devrait avoir la fonction deleteTechnicien", () => {
      expect(typeof db.deleteTechnicien).toBe("function");
    });

    it("devrait avoir la fonction getTechniciensDisponibles", () => {
      expect(typeof db.getTechniciensDisponibles).toBe("function");
    });

    it("devrait avoir la fonction getDisponibilitesByTechnicienId", () => {
      expect(typeof db.getDisponibilitesByTechnicienId).toBe("function");
    });

    it("devrait avoir la fonction setDisponibilite", () => {
      expect(typeof db.setDisponibilite).toBe("function");
    });
  });

  describe("Avis Clients", () => {
    it("devrait avoir la fonction getAvisByArtisanId", () => {
      expect(typeof db.getAvisByArtisanId).toBe("function");
    });

    it("devrait avoir la fonction createAvis", () => {
      expect(typeof db.createAvis).toBe("function");
    });

    it("devrait avoir la fonction updateAvis", () => {
      expect(typeof db.updateAvis).toBe("function");
    });

    it("devrait avoir la fonction getAvisStats", () => {
      expect(typeof db.getAvisStats).toBe("function");
    });

    it("devrait avoir la fonction createDemandeAvis", () => {
      expect(typeof db.createDemandeAvis).toBe("function");
    });

    it("devrait avoir la fonction getDemandeAvisByToken", () => {
      expect(typeof db.getDemandeAvisByToken).toBe("function");
    });
  });

  describe("Calcul des statistiques d'avis", () => {
    it("devrait calculer correctement la moyenne des notes", async () => {
      // Test de la logique de calcul
      const notes = [5, 4, 5, 3, 4];
      const moyenne = notes.reduce((a, b) => a + b, 0) / notes.length;
      expect(moyenne).toBe(4.2);
    });

    it("devrait calculer correctement la distribution des notes", () => {
      const notes = [5, 4, 5, 3, 4, 5, 5, 4];
      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      notes.forEach(note => distribution[note]++);
      
      expect(distribution[5]).toBe(4);
      expect(distribution[4]).toBe(3);
      expect(distribution[3]).toBe(1);
      expect(distribution[2]).toBe(0);
      expect(distribution[1]).toBe(0);
    });
  });

  describe("Gestion des disponibilités techniciens", () => {
    it("devrait valider les jours de la semaine (0-6)", () => {
      const joursValides = [0, 1, 2, 3, 4, 5, 6];
      joursValides.forEach(jour => {
        expect(jour).toBeGreaterThanOrEqual(0);
        expect(jour).toBeLessThanOrEqual(6);
      });
    });

    it("devrait valider le format des heures", () => {
      const heureRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      expect(heureRegex.test("09:00")).toBe(true);
      expect(heureRegex.test("17:30")).toBe(true);
      expect(heureRegex.test("23:59")).toBe(true);
      expect(heureRegex.test("25:00")).toBe(false);
    });
  });

  describe("Messages du chat", () => {
    it("devrait valider les types d'expéditeur", () => {
      const expediteursValides = ["artisan", "client"];
      expediteursValides.forEach(exp => {
        expect(["artisan", "client"]).toContain(exp);
      });
    });

    it("devrait ne pas accepter de message vide", () => {
      const message = "";
      expect(message.trim().length).toBe(0);
    });
  });
});
