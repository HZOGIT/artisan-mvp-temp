import { describe, it, expect } from "vitest";
import { FakeEmailPort, FakeSmsPort, InMemoryStoragePort, FakePdfPort, FakeLlmPort } from "./fakes";
import type { EmailPort } from "./email";
import type { LlmPort } from "./llm";

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

  it("InMemoryStoragePort : upload / get / url / delete", async () => {
    const storage = new InMemoryStoragePort();
    const body = Buffer.from("contenu");
    const stored = await storage.upload("justif/1.pdf", body, { contentType: "application/pdf", purpose: "devis_pdf" });
    expect(stored.storageKey).toBe("justif/1.pdf");
    expect(stored.mimeType).toBe("application/pdf");
    expect(stored.sizeBytes).toBe(body.byteLength);
    expect(stored.sha256).toHaveLength(64);
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

  it("LlmPort : un use-case dépend du PORT ; le fake renvoie une complétion + capte le prompt", async () => {
    // use-case fictif : dépend uniquement de l'interface LlmPort.
    async function suggererTitre(llm: LlmPort, sujet: string): Promise<string> {
      const { text } = await llm.complete(`Donne un titre pour : ${sujet}`, { temperature: 0.2 });
      return text;
    }
    const llm = new FakeLlmPort('{"titre":"Réfection toiture"}');
    const out = await suggererTitre(llm, "devis toiture");
    expect(out).toContain("Réfection toiture");
    expect(llm.prompts[0]).toContain("devis toiture");
  });

  it("LlmPort.stream : les fragments concaténés reconstituent la réponse", async () => {
    const llm = new FakeLlmPort("Bonjour, je suis l'assistant Operioz.");
    let acc = "";
    let chunks = 0;
    for await (const chunk of llm.stream("salut")) {
      if (chunk.kind === "text") { acc += chunk.text; chunks++; }
    }
    expect(acc).toBe("Bonjour, je suis l'assistant Operioz.");
    expect(chunks).toBeGreaterThan(1); // bien un flux (plusieurs fragments)
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
