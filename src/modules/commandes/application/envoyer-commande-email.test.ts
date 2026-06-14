import { describe, it, expect } from "vitest";
import { FakeCommandeRepository } from "../infra/commande-repository-fake";
import { FakeFournisseurRepository } from "../../fournisseurs/infra/fournisseur-repository-fake";
import { envoyerCommandeParEmail, buildCommandeEmail, type CommandeMailingDeps } from "./envoyer-commande-email";
import { FakeEmailPort, FakePdfPort, FakeRateLimiter } from "../../../shared/ports";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

// Monte une commande (brouillon) liée à un fournisseur (avec ou sans email) + les deps de mailing.
async function setup(opts: { fournisseurEmail?: string | null } = {}) {
  const commandeRepo = new FakeCommandeRepository();
  const fournisseurRepo = new FakeFournisseurRepository();
  const f = await fournisseurRepo.create(A, {
    nom: "Plomberie Pro",
    contact: "M. Dubois",
    email: opts.fournisseurEmail === undefined ? "f@pro.fr" : opts.fournisseurEmail,
  });
  commandeRepo.seedFournisseur(f.id, A.artisanId);
  const commande = await commandeRepo.create(A, {
    fournisseurId: f.id,
    notes: "Livrer avant vendredi",
    lignes: [{ designation: "Tuyau cuivre", quantite: "10", prixUnitaire: "5.00" }],
  });
  const deps: CommandeMailingDeps = {
    repo: commandeRepo,
    fournisseurRepo,
    artisanReader: { getArtisan: async () => ({ id: 1, nomEntreprise: "ACME Plomberie", email: "pro@acme.fr" }) },
    pdf: new FakePdfPort(),
    email: new FakeEmailPort(),
    rateLimiter: new FakeRateLimiter(),
  };
  return { commandeRepo, fournisseurRepo, deps, commande: commande! };
}

describe("buildCommandeEmail (pur)", () => {
  it("sujet + corps + notes (échappées)", () => {
    const { subject, body } = buildCommandeEmail({ artisanName: "ACME", destinataire: "M. Dubois", numero: "CMD-00001", notes: "<b>urgent</b>" });
    expect(subject).toBe("Bon de commande CMD-00001 - ACME");
    expect(body).toContain("CMD-00001");
    expect(body).toContain("M. Dubois");
    expect(body).toContain("&lt;b&gt;urgent&lt;/b&gt;");
  });
});

describe("envoyerCommandeParEmail", () => {
  it("envoie le bon de commande PDF au fournisseur et passe la commande en 'envoyee'", async () => {
    const { deps, commande } = await setup();
    const res = await envoyerCommandeParEmail(deps, A, commande.id);
    expect(res.success).toBe(true);
    const email = deps.email as FakeEmailPort;
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("f@pro.fr");
    expect(email.sent[0].attachments![0].filename).toBe("bon-commande-CMD-00001.pdf");
    const pdf = deps.pdf as FakePdfPort;
    expect(pdf.rendered[0].template).toBe("bon-commande");
    expect((await deps.repo.getById(A, commande.id))!.statut).toBe("envoyee");
  });

  it("fournisseur sans email → ValidationError (400), aucun envoi", async () => {
    const { deps, commande } = await setup({ fournisseurEmail: null });
    await expect(envoyerCommandeParEmail(deps, A, commande.id)).rejects.toBeInstanceOf(ValidationError);
    expect((deps.email as FakeEmailPort).sent).toHaveLength(0);
  });

  it("commande d'un autre tenant → NotFoundError", async () => {
    const { deps, commande } = await setup();
    await expectCrossTenantDenied(() => envoyerCommandeParEmail(deps, B, commande.id));
  });

  it("rate-limit atteint → TooManyRequestsError, aucun envoi", async () => {
    const { deps, commande } = await setup();
    (deps.rateLimiter as FakeRateLimiter).denyKey("bc:1");
    await expect(envoyerCommandeParEmail(deps, A, commande.id)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect((deps.email as FakeEmailPort).sent).toHaveLength(0);
  });
});
