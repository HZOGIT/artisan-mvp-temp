import { describe, it, expect } from "vitest";
import { FakeDevisRepository } from "../infra/devis-repository-fake";
import { envoyerDevisParEmail, buildDevisEmail, type DevisMailingDeps } from "./envoyer-devis-email";
import { getDevisDetail } from "./read-use-cases";
import { FakeEmailPort, FakePdfPort, FakeRateLimiter } from "../../../shared/ports";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";
import type { ClientInfo } from "../../../shared/readers/contact-readers";
import { FakeModeleEmailRepository } from "../../modeles-email/infra/modele-email-repository-fake";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const CLIENT: ClientInfo = { id: 100, nom: "Durand", prenom: "Marie", email: "marie@client.fr" };

function makeMailing(over: Partial<DevisMailingDeps> & { client?: ClientInfo | null } = {}): DevisMailingDeps {
  const { client, ...rest } = over;
  const resolved = client === undefined ? CLIENT : client;
  return {
    artisanReader: { getArtisan: async () => ({ id: 1, nomEntreprise: "ACME Toiture", email: "pro@acme.fr" }) },
    clientReader: { getClient: async () => resolved },
    signatureReader: { getByDevisId: async () => null },
    appUrl: "https://staging.operioz.com",
    pdf: new FakePdfPort(),
    email: new FakeEmailPort(),
    rateLimiter: new FakeRateLimiter(),
    ...rest,
  };
}

async function seedDevis(repo: FakeDevisRepository, ctx: TenantContext) {
  const d = await repo.create(ctx, { clientId: CLIENT.id, numero: "DEV-00001", objet: "Réfection toiture" });
  await repo.addLigne(ctx, d.id, { designation: "Tuiles", prixUnitaireHT: "200.00", quantite: "1" });
  return d;
}

describe("buildDevisEmail (pur)", () => {
  it("compose sujet/corps + injecte le message (échappé)", () => {
    const { subject, body } = buildDevisEmail({
      artisanName: "ACME",
      clientName: "Marie Durand",
      numero: "DEV-00001",
      objet: "Toiture",
      totalTTC: "240.00 €",
      dateValidite: "31/07/2026",
      customMessage: "Merci <b>!</b>",
    });
    expect(subject).toBe("Devis DEV-00001 - Toiture de ACME");
    expect(body).toContain("DEV-00001");
    expect(body).toContain("240.00 €");
    expect(body).toContain("Merci &lt;b&gt;!&lt;/b&gt;");
  });
});

describe("getDevisDetail", () => {
  it("renvoie {...devis, lignes, client} ; 404 hors tenant", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const reader = { getClient: async () => CLIENT };
    const detail = await getDevisDetail(repo, reader, A, d.id);
    expect(detail.numero).toBe("DEV-00001");
    expect(detail.lignes).toHaveLength(1);
    expect(detail.client?.email).toBe("marie@client.fr");
    await expectCrossTenantDenied(() => getDevisDetail(repo, reader, B, d.id));
  });
});

describe("envoyerDevisParEmail", () => {
  it("envoie l'email avec le PDF en PJ et passe le devis en 'envoye'", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const mailing = makeMailing();
    const res = await envoyerDevisParEmail(repo, mailing, A, { devisId: d.id, attachPdf: true });
    expect(res.success).toBe(true);
    const email = mailing.email as FakeEmailPort;
    expect(email.sent[0].to).toBe("marie@client.fr");
    expect(email.sent[0].attachments![0].filename).toBe("Devis_DEV-00001.pdf");
    expect((mailing.pdf as FakePdfPort).rendered[0].template).toBe("devis");
    expect((await repo.getById(A, d.id))!.statut).toBe("envoye");
  });

  it("client sans email → ValidationError (400), aucun envoi", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const mailing = makeMailing({ client: { ...CLIENT, email: null } });
    await expect(envoyerDevisParEmail(repo, mailing, A, { devisId: d.id, attachPdf: true })).rejects.toBeInstanceOf(ValidationError);
    expect((mailing.email as FakeEmailPort).sent).toHaveLength(0);
  });

  it("devis d'un autre tenant → NotFoundError", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const mailing = makeMailing();
    await expectCrossTenantDenied(() => envoyerDevisParEmail(repo, mailing, B, { devisId: d.id, attachPdf: true }));
  });

  it("rate-limit atteint → TooManyRequestsError, aucun envoi", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const limiter = new FakeRateLimiter();
    limiter.denyKey("devis:1");
    const mailing = makeMailing({ rateLimiter: limiter });
    await expect(envoyerDevisParEmail(repo, mailing, A, { devisId: d.id, attachPdf: true })).rejects.toBeInstanceOf(TooManyRequestsError);
    expect((mailing.email as FakeEmailPort).sent).toHaveLength(0);
  });

  it("ne fait PAS régresser un devis 'accepte' lors d'un renvoi", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    repo.setStatutForTest(d.id, "accepte");
    const mailing = makeMailing();
    await envoyerDevisParEmail(repo, mailing, A, { devisId: d.id, attachPdf: false });
    expect((await repo.getById(A, d.id))!.statut).toBe("accepte");
  });

  it("utilise le modèle personnalisé `envoi_devis` quand il est défini comme default", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const modeleRepo = new FakeModeleEmailRepository();
    await modeleRepo.create(A, { nom: "Mon modèle", type: "envoi_devis", sujet: "Devis {{numero}}", contenu: "<p>Bonjour {{client_nom}}</p>", isDefault: true });
    const mailing = makeMailing({ modeleEmailRepo: modeleRepo });
    await envoyerDevisParEmail(repo, mailing, A, { devisId: d.id, attachPdf: false });
    const email = mailing.email as FakeEmailPort;
    expect(email.sent[0].subject).toBe("Devis DEV-00001");
    expect(email.sent[0].body).toContain("Bonjour Marie Durand");
    expect(email.sent[0].body).not.toContain("Veuillez trouver ci-joint");
  });

  it("fallback gabarit codé en dur si aucun modèle default n'existe", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const modeleRepo = new FakeModeleEmailRepository();
    const mailing = makeMailing({ modeleEmailRepo: modeleRepo });
    await envoyerDevisParEmail(repo, mailing, A, { devisId: d.id, attachPdf: false });
    const email = mailing.email as FakeEmailPort;
    expect(email.sent[0].body).toContain("Veuillez trouver ci-joint");
  });

  it("lien signature pointe vers /devis-public/<token>, pas /portail/<token>", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const mailing = makeMailing({
      signatureReader: { getByDevisId: async () => ({ id: 1, token: "tok-abc123", createdAt: new Date() }) },
    });
    await envoyerDevisParEmail(repo, mailing, A, { devisId: d.id, attachPdf: false });
    const { body } = (mailing.email as FakeEmailPort).sent[0];
    expect(body).toContain("/devis-public/tok-abc123");
    expect(body).not.toContain("/portail/tok-abc123");
  });

  it("modèle + customMessage → message ajouté après le contenu du modèle", async () => {
    const repo = new FakeDevisRepository();
    const d = await seedDevis(repo, A);
    const modeleRepo = new FakeModeleEmailRepository();
    await modeleRepo.create(A, { nom: "Mon modèle", type: "envoi_devis", sujet: "Devis {{numero}}", contenu: "<p>Corps</p>", isDefault: true });
    const mailing = makeMailing({ modeleEmailRepo: modeleRepo });
    await envoyerDevisParEmail(repo, mailing, A, { devisId: d.id, attachPdf: false, customMessage: "Note spéciale" });
    const email = mailing.email as FakeEmailPort;
    expect(email.sent[0].body).toContain("Note spéciale");
    expect(email.sent[0].body).toContain("<p>Corps</p>");
  });
});
