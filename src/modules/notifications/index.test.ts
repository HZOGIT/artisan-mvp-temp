import { describe, it, expect } from "vitest";
import * as notificationsPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime).
describe("notifications — barrel (contrat public)", () => {
  it("expose le factory createNotificationsModule", () => {
    expect(typeof notificationsPublic.createNotificationsModule).toBe("function");
  });
});
