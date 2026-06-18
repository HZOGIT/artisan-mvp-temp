import { describe, it, expect, beforeEach } from "vitest";
import { FakeDemandeAvisRepository } from "../infra/demande-avis-repository-fake";
import { FakeEmailPort, FakeRateLimiter } from "../../../shared/ports/fakes";
import { envoyerDemandeAvis, envoyerDemandeAvisParClient, type DemandeAvisDeps } from "./demande-avis-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("avis — workflow demande d'avis (use-cases, ports mockés)", () => {
  let repo: FakeDemandeAvisRepository;
  let email: FakeEmailPort;
  let rateLimiter: FakeRateLimiter;
  let deps: DemandeAvisDeps;

  beforeEach(() => {
    repo = new FakeDemandeAvisRepository();
    email = new FakeEmailPort();
    rateLimiter = new FakeRateLimiter();
    deps = {
      repo,
      email,
      rateLimiter,
      lienBaseUrl: "https://www.operioz.com",
      genererToken: () => "tok-fixe",
      maintenant: () => new Date("2026-06-13T00:00:00Z"),
    };
    // Tenant A : client avec email + 2 interventions
    repo.seedClient({ id: 100, artisanId: 1, nom: "Dupont", email: "j@d.fr" });
    repo.seedClient({ id: 101, artisanId: 1, nom: "SansMail", email: null });
    repo.seedIntervention({ id: 200, artisanId: 1, clientId: 100, dateDebut: new Date("2026-05-01") });
    repo.seedIntervention({ id: 201, artisanId: 1, clientId: 100, dateDebut: new Date("2026-06-01") });
    // Tenant B : intervention/client à lui
    repo.seedClient({ id: 300, artisanId: 2, nom: "Autre", email: "a@b.fr" });
    repo.seedIntervention({ id: 400, artisanId: 2, clientId: 300, dateDebut: new Date("2026-05-15") });
  });

  it("envoyerDemandeAvis : crée la demande + envoie 1 email avec le lien token", async () => {
    const demande = await envoyerDemandeAvis(deps, A, 200);
    expect(demande.interventionId).toBe(200);
    expect(demande.clientId).toBe(100);
    expect(demande.tokenDemande).toBe("tok-fixe");
    expect(demande.expiresAt).toEqual(new Date("2026-06-27T00:00:00Z")); // +14j
    expect(repo.demandes.length).toBe(1);
    expect(email.sent.length).toBe(1);
    expect(email.sent[0].to).toBe("j@d.fr");
    expect(email.sent[0].body).toContain("https://www.operioz.com/avis/tok-fixe");
    expect(rateLimiter.checked).toEqual(["avis:1"]);
  });

  it("envoyerDemandeAvis : intervention d'un autre tenant → NotFound (anti-oracle)", async () => {
    await expect(envoyerDemandeAvis(deps, B, 200)).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => envoyerDemandeAvis(deps, B, 200));
    expect(email.sent.length).toBe(0);
    expect(repo.demandes.length).toBe(0);
  });

  it("envoyerDemandeAvis : client sans email → ValidationError, aucun envoi", async () => {
    repo.seedIntervention({ id: 202, artisanId: 1, clientId: 101, dateDebut: new Date("2026-05-01") });
    await expect(envoyerDemandeAvis(deps, A, 202)).rejects.toBeInstanceOf(ValidationError);
    expect(email.sent.length).toBe(0);
  });

  it("envoyerDemandeAvis : rate limit atteint → TooManyRequests, aucun effet de bord", async () => {
    rateLimiter.denyKey("avis:1");
    await expect(envoyerDemandeAvis(deps, A, 200)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(repo.demandes.length).toBe(0);
    expect(email.sent.length).toBe(0);
  });

  it("envoyerDemandeAvisParClient : utilise la dernière intervention du client", async () => {
    const demande = await envoyerDemandeAvisParClient(deps, A, 100);
    expect(demande.interventionId).toBe(201); // la plus récente (2026-06-01)
    expect(email.sent.length).toBe(1);
  });

  it("envoyerDemandeAvisParClient : client d'un autre tenant → NotFound", async () => {
    await expect(envoyerDemandeAvisParClient(deps, B, 100)).rejects.toBeInstanceOf(NotFoundError);
    expect(email.sent.length).toBe(0);
  });

  it("envoyerDemandeAvisParClient : client sans intervention → ValidationError", async () => {
    repo.seedClient({ id: 102, artisanId: 1, nom: "Neuf", email: "n@d.fr" });
    await expect(envoyerDemandeAvisParClient(deps, A, 102)).rejects.toBeInstanceOf(ValidationError);
    expect(email.sent.length).toBe(0);
  });
});
