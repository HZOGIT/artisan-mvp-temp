import { describe, it, expect } from "vitest";
import { FakeDevisRepository } from "../infra/devis-repository-fake";
import { FakeRelanceDevisRepository } from "../../relances-devis/infra/relance-devis-repository-fake";
import { envoyerRelanceDevis, envoyerRelancesAutomatiques, type DevisRelanceDeps } from "./relances-devis";
import { FakeEmailPort, FakeRateLimiter } from "../../../shared/ports";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { EmailOptoutRepositoryFake } from "../../emails/infra/email-optout-repository-fake";
import type { TenantContext } from "../../../shared/tenant";
import type { ClientInfo } from "../../../shared/readers/contact-readers";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const CLIENT: ClientInfo = { id: 100, nom: "Durand", prenom: "Marie", email: "marie@client.fr" };

function makeDeps(over: Partial<DevisRelanceDeps> & { client?: ClientInfo | null } = {}): DevisRelanceDeps {
  const { client, ...rest } = over;
  const resolved = client === undefined ? CLIENT : client;
  return {
    devisRepo: new FakeDevisRepository(),
    relanceRepo: new FakeRelanceDevisRepository(),
    clientReader: { getClient: async () => resolved },
    artisanReader: { getArtisan: async () => ({ id: 1, nomEntreprise: "ACME", email: "pro@acme.fr" }) },
    email: new FakeEmailPort(),
    rateLimiter: new FakeRateLimiter(),
    ...rest,
  };
}

async function seedDevis(repo: FakeDevisRepository, ctx: TenantContext, statut: "brouillon" | "envoye" | "accepte" | "refuse", dateDevis?: Date) {
  const d = await repo.create(ctx, { clientId: CLIENT.id, numero: "DEV-00001" });
  if (statut !== "brouillon") repo.setStatutForTest(d.id, statut);
  if (dateDevis) repo.setDateDevisForTest?.(d.id, dateDevis);
  return d;
}

describe("envoyerRelanceDevis", () => {
  it("envoie + enregistre la relance (statut envoye) ; renvoie success", async () => {
    const devisRepo = new FakeDevisRepository();
    const relanceRepo = new FakeRelanceDevisRepository();
    const deps = makeDeps({ devisRepo, relanceRepo });
    const d = await seedDevis(devisRepo, A, "envoye");
    const res = await envoyerRelanceDevis(deps, A, { devisId: d.id });
    expect(res.success).toBe(true);
    expect((deps.email as FakeEmailPort).sent[0].to).toBe("marie@client.fr");
    const relances = await relanceRepo.listByDevis(A, d.id);
    expect(relances).toHaveLength(1);
    expect(relances[0].statut).toBe("envoye");
  });

  it("échec d'envoi → relance enregistrée en statut echec, mais proc success", async () => {
    const devisRepo = new FakeDevisRepository();
    const relanceRepo = new FakeRelanceDevisRepository();
    const email = new FakeEmailPort();
    email.failOnce();
    const deps = makeDeps({ devisRepo, relanceRepo, email });
    const d = await seedDevis(devisRepo, A, "envoye");
    const res = await envoyerRelanceDevis(deps, A, { devisId: d.id });
    expect(res.success).toBe(true);
    expect((await relanceRepo.listByDevis(A, d.id))[0].statut).toBe("echec");
  });

  it("devis brouillon, accepté ou refusé → 400 (ValidationError)", async () => {
    const devisRepo = new FakeDevisRepository();
    const dB = await seedDevis(devisRepo, A, "brouillon");
    await expect(envoyerRelanceDevis(makeDeps({ devisRepo }), A, { devisId: dB.id })).rejects.toBeInstanceOf(ValidationError);
    const dA = await seedDevis(devisRepo, A, "accepte");
    await expect(envoyerRelanceDevis(makeDeps({ devisRepo }), A, { devisId: dA.id })).rejects.toBeInstanceOf(ValidationError);
    const dR = await seedDevis(devisRepo, A, "refuse");
    await expect(envoyerRelanceDevis(makeDeps({ devisRepo }), A, { devisId: dR.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("client sans email → 400 ; devis hors tenant → 404 ; rate-limit → 429", async () => {
    const devisRepo = new FakeDevisRepository();
    const d = await seedDevis(devisRepo, A, "envoye");
    await expect(envoyerRelanceDevis(makeDeps({ devisRepo, client: { ...CLIENT, email: null } }), A, { devisId: d.id })).rejects.toBeInstanceOf(ValidationError);
    await expectCrossTenantDenied(() => envoyerRelanceDevis(makeDeps({ devisRepo }), B, { devisId: d.id }));
    const limiter = new FakeRateLimiter();
    limiter.denyKey("relance:1");
    await expect(envoyerRelanceDevis(makeDeps({ devisRepo, rateLimiter: limiter }), A, { devisId: d.id })).rejects.toBeInstanceOf(TooManyRequestsError);
  });
});

describe("envoyerRelancesAutomatiques", () => {
  it("relance les devis non signés ≥ joursMinimum, respecte joursEntreRelances, compte les envois", async () => {
    const devisRepo = new FakeDevisRepository();
    const relanceRepo = new FakeRelanceDevisRepository();
    const now = new Date("2026-06-14T00:00:00Z");
    // d1 : ancien (40 j) non signé → relancé
    const d1 = await seedDevis(devisRepo, A, "envoye", new Date("2026-05-05T00:00:00Z"));
    // d2 : récent (2 j) → ignoré (trop jeune)
    await seedDevis(devisRepo, A, "brouillon", new Date("2026-06-12T00:00:00Z"));
    // d3 : signé (accepte) → exclu de listNonSignes
    await seedDevis(devisRepo, A, "accepte", new Date("2026-01-01T00:00:00Z"));
    const deps = makeDeps({ devisRepo, relanceRepo, maintenant: () => now });

    const res = await envoyerRelancesAutomatiques(deps, A, { joursMinimum: 7, joursEntreRelances: 7 });
    expect(res.relancesEnvoyees).toBe(1);
    expect((await relanceRepo.listByDevis(A, d1.id))).toHaveLength(1);

    // 2e passage immédiat : throttle (relance récente < joursEntreRelances) → 0
    const res2 = await envoyerRelancesAutomatiques(deps, A, { joursMinimum: 7, joursEntreRelances: 7 });
    expect(res2.relancesEnvoyees).toBe(0);
  });

  it("devis brouillon ancien (> joursMinimum) → ignoré par l'auto-relance", async () => {
    const devisRepo = new FakeDevisRepository();
    const relanceRepo = new FakeRelanceDevisRepository();
    const now = new Date("2026-06-14T00:00:00Z");
    const d = await seedDevis(devisRepo, A, "brouillon", new Date("2026-05-01T00:00:00Z"));
    const deps = makeDeps({ devisRepo, relanceRepo, maintenant: () => now });
    const res = await envoyerRelancesAutomatiques(deps, A, { joursMinimum: 7, joursEntreRelances: 7 });
    expect(res.relancesEnvoyees).toBe(0);
    expect(await relanceRepo.listByDevis(A, d.id)).toHaveLength(0);
  });

  it("rate-limit en masse → 429", async () => {
    const limiter = new FakeRateLimiter();
    limiter.denyKey("relance-auto:1");
    await expect(envoyerRelancesAutomatiques(makeDeps({ rateLimiter: limiter }), A)).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("OPE-797 — nombreMaxRelances respecté : pas de relance au-delà du plafond", async () => {
    const devisRepo = new FakeDevisRepository();
    const relanceRepo = new FakeRelanceDevisRepository();
    const now = new Date("2026-06-14T00:00:00Z");
    const d = await seedDevis(devisRepo, A, "envoye", new Date("2026-05-01T00:00:00Z"));
    const deps = makeDeps({ devisRepo, relanceRepo, maintenant: () => now });

    const r1 = await envoyerRelancesAutomatiques(deps, A, { joursMinimum: 1, joursEntreRelances: 0, nombreMaxRelances: 1 });
    expect(r1.relancesEnvoyees).toBe(1);

    const r2 = await envoyerRelancesAutomatiques(deps, A, { joursMinimum: 1, joursEntreRelances: 0, nombreMaxRelances: 1 });
    expect(r2.relancesEnvoyees).toBe(0);

    expect(await relanceRepo.listByDevis(A, d.id)).toHaveLength(1);
  });

  it("OPE-798 — client opt-out ignoré par l'auto-relance (continue, aucun email)", async () => {
    const devisRepo = new FakeDevisRepository();
    const relanceRepo = new FakeRelanceDevisRepository();
    const now = new Date("2026-06-14T00:00:00Z");
    await seedDevis(devisRepo, A, "envoye", new Date("2026-05-01T00:00:00Z"));
    const optoutRepo = new EmailOptoutRepositoryFake();
    optoutRepo.seed(CLIENT.email!);
    const email = new FakeEmailPort();
    const deps = makeDeps({ devisRepo, relanceRepo, email, maintenant: () => now, optoutRepo });

    const res = await envoyerRelancesAutomatiques(deps, A, { joursMinimum: 1, joursEntreRelances: 0 });
    expect(res.relancesEnvoyees).toBe(0);
    expect(email.sent).toHaveLength(0);
  });
});
