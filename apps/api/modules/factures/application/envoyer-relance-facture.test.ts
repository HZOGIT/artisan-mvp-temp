import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { buildRelanceEmail, joursDeRetard, envoyerRelanceFacture, type RelanceMailingDeps } from "./envoyer-relance-facture";
import { FakeEmailPort, FakeRateLimiter } from "../../../shared/ports";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { EmailOptoutRepositoryFake } from "../../emails/infra/email-optout-repository-fake";
import type { TenantContext } from "../../../shared/tenant";
import type { ClientInfo } from "./contact-readers";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const CLIENT: ClientInfo = { id: 100, nom: "Durand", prenom: "Marie", email: "marie@client.fr" };

function makeDeps(over: Partial<RelanceMailingDeps> & { client?: ClientInfo | null } = {}): RelanceMailingDeps {
  const { client, ...rest } = over;
  const resolved = client === undefined ? CLIENT : client;
  return {
    artisanReader: { getArtisan: async () => ({ id: 1, nomEntreprise: "ACME Plomberie", email: "pro@acme.fr" }) },
    clientReader: { getClient: async () => resolved },
    email: new FakeEmailPort(),
    rateLimiter: new FakeRateLimiter(),
    ...rest,
  };
}

async function seedFacture(
  repo: FakeFactureRepository,
  ctx: TenantContext,
  dateEcheance?: Date,
  statut: "brouillon" | "validee" | "envoyee" | "payee" | "en_retard" | "annulee" = "envoyee",
) {
  const f = await repo.create(ctx, { clientId: CLIENT.id, numero: "FAC-00001", objet: "Réparation", ...(dateEcheance ? { dateEcheance } : {}) });
  await repo.addLigne(ctx, f.id, { designation: "MO", prixUnitaireHT: "100.00", quantite: "1" });
  repo.setStatutForTest(f.id, statut);
  return f;
}

describe("buildRelanceEmail (pur)", () => {
  it("sujet rappel + n° facture + montant + jours de retard ; message libre échappé", () => {
    const { subject, body } = buildRelanceEmail({
      artisanName: "ACME",
      clientName: "Marie Durand",
      factureNumero: "FAC-00001",
      totalTTC: "120.00 €",
      joursRetard: 12,
      customMessage: "Merci <b>de régler</b>",
    });
    expect(subject).toBe("Rappel : facture FAC-00001 en attente de règlement");
    expect(body).toContain("FAC-00001");
    expect(body).toContain("120.00 €");
    expect(body).toContain("12 jour(s)");
    expect(body).toContain("Merci &lt;b&gt;de régler&lt;/b&gt;");
    expect(body).not.toContain("<b>de régler</b>");
  });

  it("niveau 1 (défaut) : sujet amiable, pas de mention légale", () => {
    const { subject, body } = buildRelanceEmail({
      artisanName: "ACME",
      clientName: "Marie Durand",
      factureNumero: "FAC-00001",
      totalTTC: "120.00 €",
      joursRetard: 12,
      niveau: 1,
    });
    expect(subject).toBe("Rappel : facture FAC-00001 en attente de règlement");
    expect(body).toContain("Nous vous serions reconnaissants");
    expect(body).not.toContain("Mise en demeure");
    expect(body).not.toContain("article L. 441-10");
  });

  it("niveau 2 : sujet ferme, pas de mention légale", () => {
    const { subject, body } = buildRelanceEmail({
      artisanName: "ACME",
      clientName: "Marie Durand",
      factureNumero: "FAC-00001",
      totalTTC: "120.00 €",
      joursRetard: 15,
      niveau: 2,
    });
    expect(subject).toBe("2ème rappel : règlement urgent — facture FAC-00001");
    expect(body).toContain("Nous vous serions reconnaissants");
    expect(body).not.toContain("Mise en demeure");
    expect(body).not.toContain("article L. 441-10");
  });

  it("niveau 3+ : sujet mise en demeure, paragraphe légal (L441-10 + délai 8j + indemnité 40€)", () => {
    const { subject, body } = buildRelanceEmail({
      artisanName: "ACME",
      clientName: "Marie Durand",
      factureNumero: "FAC-00001",
      totalTTC: "120.00 €",
      joursRetard: 30,
      niveau: 3,
    });
    expect(subject).toBe("Mise en demeure : facture FAC-00001 — règlement immédiat requis");
    expect(body).toContain("Mise en demeure");
    expect(body).toContain("délai de 8 jours");
    expect(body).toContain("article L. 441-10");
    expect(body).toContain("indemnité forfaitaire de 40 €");
    expect(body).toContain("action en justice");
  });
});

describe("joursDeRetard", () => {
  it("0 sans échéance ; calcule depuis l'échéance", () => {
    expect(joursDeRetard(null, Date.now())).toBe(0);
    const now = new Date("2026-06-15").getTime();
    expect(joursDeRetard(new Date("2026-06-05"), now)).toBe(10);
    expect(joursDeRetard(new Date("2026-07-01"), now)).toBe(0); // non échue
  });
});

describe("envoyerRelanceFacture", () => {
  it("succès : envoie l'email (sans PDF) ; statut INCHANGÉ", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A, new Date(Date.now() - 5 * 86400000));
    const email = new FakeEmailPort();
    const res = await envoyerRelanceFacture(repo, makeDeps({ email }), A, { factureId: f.id });
    expect(res.success).toBe(true);
    expect(res.message).toContain("facture FAC-00001");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].attachments ?? []).toHaveLength(0); // pas de PDF
    expect((await repo.getById(A, f.id))!.statut).toBe("envoyee"); /* statut inchangé par la relance */
  });

  it("incrémente nombreRelances : 0 → 1, puis 1 → 2, etc.", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A, new Date(Date.now() - 5 * 86400000));
    const email = new FakeEmailPort();
    const deps = makeDeps({ email });

    expect((await repo.getById(A, f.id))!.nombreRelances).toBe(0);

    /** 1ère relance */
    await envoyerRelanceFacture(repo, deps, A, { factureId: f.id });
    expect(email.sent[0].subject).toContain("Rappel");
    expect((await repo.getById(A, f.id))!.nombreRelances).toBe(1);

    /** 2ème relance */
    await envoyerRelanceFacture(repo, deps, A, { factureId: f.id });
    expect(email.sent[1].subject).toContain("2ème rappel");
    expect((await repo.getById(A, f.id))!.nombreRelances).toBe(2);

    /** 3ème relance : mise en demeure */
    await envoyerRelanceFacture(repo, deps, A, { factureId: f.id });
    expect(email.sent[2].subject).toContain("Mise en demeure");
    expect((await repo.getById(A, f.id))!.nombreRelances).toBe(3);
  });

  it("facture d'un autre tenant → NotFound (anti-IDOR)", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    await expectCrossTenantDenied(() => envoyerRelanceFacture(repo, makeDeps(), B, { factureId: f.id }));
  });

  it("client sans email → ValidationError (400)", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    await expect(envoyerRelanceFacture(repo, makeDeps({ client: { ...CLIENT, email: null } }), A, { factureId: f.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rate-limit atteint → TooManyRequests (429)", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const limiter = new FakeRateLimiter();
    limiter.denyKey("relance:1");
    await expect(envoyerRelanceFacture(repo, makeDeps({ rateLimiter: limiter }), A, { factureId: f.id })).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("facture inexistante → NotFound", async () => {
    const repo = new FakeFactureRepository();
    await expect(envoyerRelanceFacture(repo, makeDeps(), A, { factureId: 999 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("artisan introuvable → NotFound (avant l'envoi)", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const email = new FakeEmailPort();
    const deps = makeDeps({ email, artisanReader: { getArtisan: async () => null } });
    await expect(envoyerRelanceFacture(repo, deps, A, { factureId: f.id })).rejects.toBeInstanceOf(NotFoundError);
    expect(email.sent).toHaveLength(0); /* garde AVANT l'envoi */
  });

  it("OPE-794 — facture payée ou annulée → ValidationError, aucun email envoyé", async () => {
    const repo = new FakeFactureRepository();
    const email = new FakeEmailPort();
    const deps = makeDeps({ email });

    const fPayee = await seedFacture(repo, A, undefined, "payee");
    await expect(envoyerRelanceFacture(repo, deps, A, { factureId: fPayee.id })).rejects.toBeInstanceOf(ValidationError);

    const fAnnulee = await seedFacture(repo, A, undefined, "annulee");
    await expect(envoyerRelanceFacture(repo, deps, A, { factureId: fAnnulee.id })).rejects.toBeInstanceOf(ValidationError);

    expect(email.sent).toHaveLength(0);
  });

  it("OPE-794 — brouillon et validee → ValidationError", async () => {
    const repo = new FakeFactureRepository();
    const fBrouillon = await seedFacture(repo, A, undefined, "brouillon");
    await expect(envoyerRelanceFacture(repo, makeDeps(), A, { factureId: fBrouillon.id })).rejects.toBeInstanceOf(ValidationError);
    const fValidee = await seedFacture(repo, A, undefined, "validee");
    await expect(envoyerRelanceFacture(repo, makeDeps(), A, { factureId: fValidee.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("OPE-798 — client opt-out → relance non envoyée (success:false), aucun email", async () => {
    const repo = new FakeFactureRepository();
    const f = await seedFacture(repo, A);
    const email = new FakeEmailPort();
    const optoutRepo = new EmailOptoutRepositoryFake();
    optoutRepo.seed(CLIENT.email!);
    const res = await envoyerRelanceFacture(repo, makeDeps({ email, optoutRepo }), A, { factureId: f.id });
    expect(res.success).toBe(false);
    expect(email.sent).toHaveLength(0);
  });
});
