import { describe, it, expect } from "vitest";
import { FakeEmailPort, FakeSmsPort, InMemoryStoragePort, FakePdfPort } from "./fakes";
import type { EmailPort } from "./email";

// Use-case fictif : dépend uniquement du PORT (interface), pas d'une impl concrète.
async function envoyerBienvenue(email: EmailPort, to: string): Promise<void> {
  await email.send({ to, subject: "Bienvenue", body: "Bonjour et bienvenue !" });
}

describe("ports — découplage use-case / infra", () => {
  it("un use-case appelle EmailPort.send (fake enregistre l'envoi)", async () => {
    const email = new FakeEmailPort();
    await envoyerBienvenue(email, "a@b.fr");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toEqual({ to: "a@b.fr", subject: "Bienvenue", body: "Bonjour et bienvenue !" });
  });

  it("EmailPort propage l'échec (le use-case peut le gérer)", async () => {
    const email = new FakeEmailPort();
    email.failOnce();
    await expect(envoyerBienvenue(email, "a@b.fr")).rejects.toThrow(/échec/);
    expect(email.sent).toHaveLength(0);
  });

  it("FakeSmsPort enregistre les SMS", async () => {
    const sms = new FakeSmsPort();
    await sms.send({ to: "+33600000000", message: "Code: 1234" });
    expect(sms.sent).toEqual([{ to: "+33600000000", message: "Code: 1234" }]);
  });

  it("InMemoryStoragePort : put / get / url / delete", async () => {
    const storage = new InMemoryStoragePort();
    const body = Buffer.from("contenu");
    await storage.put("justif/1.pdf", body, { contentType: "application/pdf" });
    expect((await storage.get("justif/1.pdf"))?.toString()).toBe("contenu");
    expect(await storage.url("justif/1.pdf")).toBe("memory://justif/1.pdf");
    await storage.delete("justif/1.pdf");
    expect(await storage.get("justif/1.pdf")).toBeNull();
  });

  it("FakePdfPort : render produit un binaire et enregistre l'appel", async () => {
    const pdf = new FakePdfPort();
    const out = await pdf.render("facture", { numero: "FAC-1", total: 1200 });
    expect(out).toBeInstanceOf(Buffer);
    expect(out.toString()).toContain("facture");
    expect(pdf.rendered).toHaveLength(1);
    expect(pdf.rendered[0].data).toEqual({ numero: "FAC-1", total: 1200 });
  });

  it("EmailPort transporte une pièce jointe (PDF) ; rétro-compatible sans pièce jointe", async () => {
    const email = new FakeEmailPort();
    // sans pièce jointe (appelants existants) → attachments undefined
    await email.send({ to: "a@b.fr", subject: "S", body: "B" });
    expect(email.sent[0].attachments).toBeUndefined();
    // avec une pièce jointe (PDF du document)
    const pdf = Buffer.from("%PDF-1.4 fake");
    await email.send({ to: "c@d.fr", subject: "Facture", body: "Voir PJ", attachments: [{ filename: "Facture_FAC-1.pdf", content: pdf, contentType: "application/pdf" }] });
    expect(email.sent[1].attachments).toHaveLength(1);
    expect(email.sent[1].attachments![0].filename).toBe("Facture_FAC-1.pdf");
    expect(email.sent[1].attachments![0].content).toBe(pdf);
  });
});
