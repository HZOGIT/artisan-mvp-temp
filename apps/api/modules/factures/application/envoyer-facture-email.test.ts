import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { envoyerFactureParEmail, buildFactureEmail, type FactureMailingDeps } from "./envoyer-facture-email";
import { FakeEmailPort, FakePdfPort, FakeRateLimiter, InMemoryStoragePort } from "../../../shared/ports";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";
import type { ClientInfo } from "./contact-readers";
import { FakeModeleEmailRepository } from "../../modeles-email/infra/modele-email-repository-fake";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const CLIENT: ClientInfo = { id: 100, nom: "Durand", prenom: "Marie", email: "marie@client.fr" };

function makeDeps(over: Partial<FactureMailingDeps> & { client?: ClientInfo | null } = {}): FactureMailingDeps {
  const { client, ...rest } = over;
  const resolved = client === undefined ? CLIENT : client;
  return {
    artisanReader: { getArtisan: async () => ({ id: 1, nomEntreprise: "ACME Plomberie", email: "pro@acme.fr" }) },
    clientReader: { getClient: async () => resolved },
    pdf: new FakePdfPort(),
    email: new FakeEmailPort(),
    rateLimiter: new FakeRateLimiter(),
    ...rest,
  };
}

// Crée une facture (brouillon) avec une ligne (totaux non nuls).
async function seedFacture(repo: FakeFactureRepository, ctx: TenantContext) {
  const f = await repo.create(ctx, { clientId: CLIENT.id, numero: "FAC-00001", objet: "Réparation fuite" });
  await repo.addLigne(ctx, f.id, { designation: "Main d'œuvre", prixUnitaireHT: "100.00", quantite: "1" });
  return f;
}

describe("buildFactureEmail (pur)", () => {
  it("compose sujet/corps + injecte le message personnalisé (échappé)", () => {
    const { subject, body } = buildFactureEmail({
      artisanName: "ACME",
      clientName: "Marie Durand",
      numero: "FAC-00001",
      objet: "Fuite",
      totalTTC: "120.00 €",
      dateEcheance: "14/07/2026",
      customMessage: "Merci <b>beaucoup</b>",
    });
    expect(subject).toBe("Facture FAC-00001 - Fuite de ACME");
    expect(body).toContain("FAC-00001");
    expect(body).toContain("120.00 €");
    expect(body).toContain("14/07/2026");
    // XSS : le message libre est échappé.
    expect(body).toContain("Merci &lt;b&gt;beaucoup&lt;/b&gt;");
    expect(body).not.toContain("Merci <b>beaucoup</b>");
  });
});

describe("envoyerFactureParEmail", () => {
  it("envoie l'email avec le PDF en pièce jointe et passe la facture en 'envoyee'", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const deps = makeDeps();
    const email = deps.email as FakeEmailPort;
    const pdf = deps.pdf as FakePdfPort;

    const res = await envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: true });

    expect(res.success).toBe(true);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("marie@client.fr");
    expect(email.sent[0].attachments).toHaveLength(1);
    expect(email.sent[0].attachments![0].filename).toBe("Facture_FAC-00001.pdf");
    // Le PDF est rendu avec facture+lignes, artisan et client.
    expect(pdf.rendered).toHaveLength(1);
    expect(pdf.rendered[0].template).toBe("facture");
    expect((pdf.rendered[0].data as { lignes?: unknown[] }).lignes ?? (pdf.rendered[0].data.facture as { lignes: unknown[] }).lignes).toBeDefined();
    // statut brouillon → envoyee.
    expect((await repo.getById(A, f.id))!.statut).toBe("envoyee");
  });

  it("attachPdf=false : aucun PDF rendu ni pièce jointe", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const deps = makeDeps();
    await envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: false });
    expect((deps.pdf as FakePdfPort).rendered).toHaveLength(0);
    expect((deps.email as FakeEmailPort).sent[0].attachments).toBeUndefined();
  });

  it("client sans email → ValidationError (400), aucun envoi", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const deps = makeDeps({ client: { ...CLIENT, email: null } });
    await expect(envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: true })).rejects.toBeInstanceOf(ValidationError);
    expect((deps.email as FakeEmailPort).sent).toHaveLength(0);
  });

  it("facture d'un autre tenant → NotFoundError (ne révèle pas l'existence)", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const deps = makeDeps();
    await expectCrossTenantDenied(() => envoyerFactureParEmail(repo, deps, B, { factureId: f.id, attachPdf: true }));
    await expect(envoyerFactureParEmail(repo, deps, B, { factureId: f.id, attachPdf: true })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rate-limit atteint → TooManyRequestsError, aucun envoi", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const limiter = new FakeRateLimiter();
    limiter.denyKey("facture:1");
    const deps = makeDeps({ rateLimiter: limiter });
    await expect(envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: true })).rejects.toBeInstanceOf(TooManyRequestsError);
    expect((deps.email as FakeEmailPort).sent).toHaveLength(0);
  });

  it("ne fait PAS régresser un statut 'payee' lors d'un renvoi", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    repo.setStatutForTest(f.id, "payee");
    const deps = makeDeps();
    await envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: true });
    expect((await repo.getById(A, f.id))!.statut).toBe("payee");
  });

  it("utilise le modèle personnalisé `envoi_facture` quand il est défini comme default", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const modeleRepo = new FakeModeleEmailRepository();
    await modeleRepo.create(A, { nom: "Mon modèle", type: "envoi_facture", sujet: "Facture {{numero}}", contenu: "<p>Bonjour {{client_nom}}</p>", isDefault: true });
    const deps = makeDeps({ modeleEmailRepo: modeleRepo });
    await envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: false });
    const email = deps.email as FakeEmailPort;
    expect(email.sent[0].subject).toBe("Facture FAC-00001");
    expect(email.sent[0].body).toContain("Bonjour Marie Durand");
    expect(email.sent[0].body).not.toContain("Veuillez trouver ci-joint");
  });

  it("fallback gabarit codé en dur si aucun modèle default n'existe pour envoi_facture", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const modeleRepo = new FakeModeleEmailRepository();
    const deps = makeDeps({ modeleEmailRepo: modeleRepo });
    await envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: false });
    const email = deps.email as FakeEmailPort;
    expect(email.sent[0].body).toContain("Veuillez trouver ci-joint");
  });

  it("OPE-687 — persistance PDF : stocke le PDF à l'émission si storage dispo et pdfStorageKey absent", async () => {
    const repo = new FakeFactureRepository();
    const storage = new InMemoryStoragePort();
    const fakeDb = {} as never;
    const f = await seedFacture(repo, A);
    const deps = makeDeps({ storage, db: fakeDb });
    expect(f.pdfFileId).toBeNull();

    await envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: true });

    const saved = await repo.getById(A, f.id);
    expect(saved?.pdfStorageKey).not.toBeNull();
    expect(saved?.pdfStorageKey).toMatch(/^factures\//);
    expect(saved?.pdfFileId).not.toBeNull();
    const storedBuf = await storage.get(saved!.pdfStorageKey!);
    expect(storedBuf).not.toBeNull();
  });

  it("OPE-687 — réutilisation : si pdfStorageKey déjà posé, le PDF stocké est servi (pas de re-render)", async () => {
    const repo = new FakeFactureRepository();
    const storage = new InMemoryStoragePort();
    const fakeDb = {} as never;
    const f = await seedFacture(repo, A);
    const deps = makeDeps({ storage, db: fakeDb });

    await envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: true });
    const pdf = deps.pdf as FakePdfPort;
    expect(pdf.rendered).toHaveLength(1);

    await envoyerFactureParEmail(repo, deps, A, { factureId: f.id, attachPdf: true });
    expect(pdf.rendered).toHaveLength(1);
  });
});
