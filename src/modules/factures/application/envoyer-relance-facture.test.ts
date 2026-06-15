import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { buildRelanceEmail, joursDeRetard, envoyerRelanceFacture, type RelanceMailingDeps } from "./envoyer-relance-facture";
import { FakeEmailPort, FakeRateLimiter } from "../../../shared/ports";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
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

async function seedFacture(repo: FakeFactureRepository, ctx: TenantContext, dateEcheance?: Date) {
  const f = await repo.create(ctx, { clientId: CLIENT.id, numero: "FAC-00001", objet: "Réparation", ...(dateEcheance ? { dateEcheance } : {}) });
  await repo.addLigne(ctx, f.id, { designation: "MO", prixUnitaireHT: "100.00", quantite: "1" });
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
    expect((await repo.getById(A, f.id))!.statut).toBe("brouillon"); // statut inchangé
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
});
