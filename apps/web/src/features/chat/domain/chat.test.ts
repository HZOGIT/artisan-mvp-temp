import { describe, expect, it } from "vitest";
import { normalize, clientLabel, filterConversations, formatChatDate, CHAT_FILTERS, type ChatConversation } from "./chat";

const conv = (id: number, statut: string, sujet: string | null, client: { prenom: string | null; nom: string } | null): ChatConversation =>
  ({ id, statut, sujet, client } as unknown as ChatConversation);

describe("chat — domain pur", () => {
  it("normalize : accents + casse + trim", () => {
    expect(normalize("  Élec PRO  ")).toBe("elec pro");
  });

  it("clientLabel : prénom+nom, repli nom puis « Client »", () => {
    expect(clientLabel({ prenom: "Marc", nom: "Dubois" } as ChatConversation["client"])).toBe("Marc Dubois");
    expect(clientLabel({ prenom: null, nom: "Dubois" } as ChatConversation["client"])).toBe("Dubois");
    expect(clientLabel(null)).toBe("Client");
  });

  it("CHAT_FILTERS : 4 statuts de parité", () => {
    expect(CHAT_FILTERS).toEqual(["toutes", "ouvertes", "fermees", "archivees"]);
  });

  it("filterConversations : par statut", () => {
    const list = [conv(1, "ouverte", "A", null), conv(2, "fermee", "B", null), conv(3, "archivee", "C", null)];
    expect(filterConversations(list, "toutes", "").map((c) => c.id)).toEqual([1, 2, 3]);
    expect(filterConversations(list, "ouvertes", "").map((c) => c.id)).toEqual([1]);
    expect(filterConversations(list, "archivees", "").map((c) => c.id)).toEqual([3]);
  });

  it("filterConversations : recherche tolérante (nom client OU sujet, sans accents)", () => {
    const list = [
      conv(1, "ouverte", "Rénovation", { prenom: "Élodie", nom: "Martin" }),
      conv(2, "ouverte", "Plomberie", { prenom: "Karim", nom: "Benali" }),
    ];
    expect(filterConversations(list, "toutes", "elodie").map((c) => c.id)).toEqual([1]); // nom sans accent
    expect(filterConversations(list, "toutes", "plomb").map((c) => c.id)).toEqual([2]); // sujet
  });

  it("formatChatDate : 'Hier' à J-1", () => {
    const now = new Date("2026-06-10T12:00:00");
    expect(formatChatDate(new Date("2026-06-09T08:00:00"), now)).toBe("Hier");
  });
});
