import { describe, it, expect } from "vitest";
import { ResendEmailAdapter } from "./resend-email-adapter";

// Sans RESEND_API_KEY (env de test) → mode simulation : send() résout sans throw pour un message valide,
// et rejette sur message invalide (contrat EmailPort). Pas d'envoi réseau réel.
describe("ResendEmailAdapter (EmailPort, mode simulation hors RESEND_API_KEY)", () => {
  const adapter = new ResendEmailAdapter();
  it("message valide → résout (simulé)", async () => {
    await expect(adapter.send({ to: "client@example.com", subject: "Devis", body: "<p>Bonjour</p>" })).resolves.toBeUndefined();
  });
  it("paramètres manquants → throw", async () => {
    await expect(adapter.send({ to: "", subject: "x", body: "y" })).rejects.toThrow(/manquants/);
  });
  it("adresse invalide → throw", async () => {
    await expect(adapter.send({ to: "pas-un-email", subject: "x", body: "y" })).rejects.toThrow(/invalide/);
  });
});
