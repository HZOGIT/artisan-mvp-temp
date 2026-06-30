import { describe, it, expect } from "vitest";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { EmailMessage, EmailPort } from "../../../shared/ports/email";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { Signature } from "../domain/signature";
import { FakeSignaturePublicReader, FakeSignaturePublicWriter } from "../infra/signature-public-reader-fake";
import { FakeSignatureNotificationWriter } from "../infra/signature-repository-fake";
import type { SignatureDevisView, SignatureTokenResolution } from "./signature-public-reader";
import { getDevisForSignature, selectDevisOption, signDevis, refuseDevis, computeDevisHash } from "./public-use-cases";

class CapturingEmail implements EmailPort {
  public sent: EmailMessage[] = [];
  async send(m: EmailMessage): Promise<void> {
    this.sent.push(m);
  }
}
class AllowRateLimiter implements RateLimiterPort {
  async check(): Promise<boolean> {
    return true;
  }
}
class DenyRateLimiter implements RateLimiterPort {
  async check(): Promise<boolean> {
    return false;
  }
}

const NOW = new Date("2026-06-15T12:00:00Z");

const signature = (overrides: Partial<Signature> = {}): Signature => ({
  id: 1,
  devisId: 10,
  token: "tok",
  statut: "en_attente",
  signatureData: null,
  signataireName: null,
  signataireEmail: null,
  ipAddress: null,
  userAgent: null,
  motifRefus: null,
  signedAt: null,
  expiresAt: new Date("2026-07-15T12:00:00Z"),
  createdAt: new Date("2026-06-15T12:00:00Z"),
  documentHash: null,
  documentHashedAt: null,
  ...overrides,
});

const resolution = (overrides: Partial<SignatureTokenResolution> = {}): SignatureTokenResolution => ({
  signature: signature(),
  devisId: 10,
  artisanId: 1,
  dateVue: null,
  devisDateValidite: null,
  devisStatut: "envoye",
  ...overrides,
});

const view: SignatureDevisView = {
  devis: {
    id: 10,
    artisanId: 1,
    clientId: 5,
    numero: "DEV-1",
    objet: "Toiture",
    statut: "envoye",
    dateValidite: null,
    dateVue: null,
    conditionsPaiement: null,
    totalHT: "1000.00",
    totalTVA: "200.00",
    totalTTC: "1200.00",
    createdAt: NOW,
  },
  artisan: {
    id: 1,
    nomEntreprise: "Toiture Pro",
    email: "pro@test.com",
    telephone: null,
    adresse: null,
    codePostal: null,
    ville: null,
    siret: null,
    logo: null,
  },
  client: { id: 5, nom: "Dupont", prenom: "Jean", email: "jean@test.com", telephone: null, adresse: null, codePostal: null, ville: null },
  lignes: [],
  options: [],
};

function build(seed?: {
  token?: string;
  res?: SignatureTokenResolution;
  view?: SignatureDevisView;
  rateLimiter?: RateLimiterPort;
}) {
  const reader = new FakeSignaturePublicReader();
  const writer = new FakeSignaturePublicWriter();
  const email = new CapturingEmail();
  const notifications = new FakeSignatureNotificationWriter();
  const token = seed?.token ?? "tok";
  if (seed?.res !== undefined) {
    reader.seedResolution(token, seed.res);
    writer.seedSignature(seed.res.signature);
  }
  if (seed?.view !== undefined) reader.seedView(seed.res?.artisanId ?? 1, seed.res?.devisId ?? 10, seed.view);
  const deps = {
    reader,
    writer,
    email,
    notifications,
    rateLimiter: seed?.rateLimiter ?? new AllowRateLimiter(),
    maintenant: () => NOW,
  };
  return { reader, writer, email, notifications, deps };
}

describe("getDevisForSignature (public)", () => {
  it("token inconnu → NotFoundError", async () => {
    const { deps } = build();
    await expect(getDevisForSignature(deps, "absent")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lien expiré ET en_attente → ValidationError (400)", async () => {
    const expired = resolution({ signature: signature({ expiresAt: new Date("2026-06-01T00:00:00Z") }) });
    const { deps } = build({ res: expired, view });
    await expect(getDevisForSignature(deps, "tok")).rejects.toBeInstanceOf(ValidationError);
  });

  it("lien expiré MAIS déjà signé (accepte) → toujours consultable", async () => {
    const signed = resolution({ signature: signature({ statut: "accepte", expiresAt: new Date("2026-06-01T00:00:00Z"), signedAt: NOW }) });
    const { deps } = build({ res: signed, view });
    const out = await getDevisForSignature(deps, "tok");
    expect(out.signature.statut).toBe("accepte");
    expect(out.devis.numero).toBe("DEV-1");
  });

  it("succès : renvoie devis+artisan+client+signature et marque le devis vu (1ʳᵉ visite)", async () => {
    const { reader, deps } = build({ res: resolution(), view });
    const out = await getDevisForSignature(deps, "tok");
    expect(out.devis.numero).toBe("DEV-1");
    expect(out.artisan?.nomEntreprise).toBe("Toiture Pro");
    expect(out.client?.email).toBe("jean@test.com");
    expect(out.signature.token).toBe("tok");
    expect(reader.markedVu).toEqual([{ artisanId: 1, devisId: 10 }]);
  });

  it("ne re-marque pas le devis vu si déjà consulté (dateVue présent)", async () => {
    const { reader, deps } = build({ res: resolution({ dateVue: NOW }), view });
    await getDevisForSignature(deps, "tok");
    expect(reader.markedVu).toHaveLength(0);
  });

  it("vue introuvable (devis supprimé) → NotFoundError", async () => {
    const { deps } = build({ res: resolution() }); // pas de seedView
    await expect(getDevisForSignature(deps, "tok")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("selectDevisOption (public)", () => {
  it("token inconnu → NotFoundError", async () => {
    const { deps } = build();
    await expect(selectDevisOption(deps, { token: "absent", optionId: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("déjà signé → ValidationError", async () => {
    const { deps } = build({ res: resolution({ signature: signature({ signedAt: NOW }) }) });
    await expect(selectDevisOption(deps, { token: "tok", optionId: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("lien expiré → ValidationError", async () => {
    const { deps } = build({ res: resolution({ signature: signature({ expiresAt: new Date("2026-06-01") }) }) });
    await expect(selectDevisOption(deps, { token: "tok", optionId: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("option d'un AUTRE devis → NotFoundError (anti-IDOR)", async () => {
    const { deps, writer } = build({ res: resolution() });
    writer.seedOption(99, 777); // option 99 appartient au devis 777, pas au devis 10 de la signature
    await expect(selectDevisOption(deps, { token: "tok", optionId: 99 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rate-limit atteint → TooManyRequestsError", async () => {
    const { deps, writer } = build({ res: resolution(), rateLimiter: new DenyRateLimiter() });
    writer.seedOption(5, 10);
    await expect(selectDevisOption(deps, { token: "tok", optionId: 5 })).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("succès : sélectionne l'option du devis de la signature", async () => {
    const { deps, writer } = build({ res: resolution() });
    writer.seedOption(5, 10);
    const out = await selectDevisOption(deps, { token: "tok", optionId: 5 });
    expect(out).toEqual({ success: true, optionId: 5 });
    expect(writer.selected).toEqual([{ devisId: 10, optionId: 5 }]);
  });
});

describe("signDevis (public)", () => {
  const signPayload = {
    token: "tok",
    signatureData: "data:image/png;base64,xxx",
    signataireName: "Jean Dupont",
    signataireEmail: "jean@test.com",
    ipAddress: "1.2.3.4",
    userAgent: "UA",
  };

  it("token inconnu → NotFoundError", async () => {
    const { deps } = build();
    await expect(signDevis(deps, signPayload)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("statut ≠ en_attente → ValidationError (immutabilité)", async () => {
    const { deps } = build({ res: resolution({ signature: signature({ statut: "accepte" }) }), view });
    await expect(signDevis(deps, signPayload)).rejects.toBeInstanceOf(ValidationError);
  });

  it("devis déjà accepté par l'artisan (portail encore en_attente) → ValidationError (anti double-action)", async () => {
    const { deps } = build({ res: resolution({ devisStatut: "accepte" }), view });
    await expect(signDevis(deps, signPayload)).rejects.toBeInstanceOf(ValidationError);
  });

  it("devis refusé par l'artisan (portail encore en_attente) → ValidationError (cohérence)", async () => {
    const { deps } = build({ res: resolution({ devisStatut: "refuse" }), view });
    await expect(signDevis(deps, signPayload)).rejects.toBeInstanceOf(ValidationError);
  });

  it("lien expiré → ValidationError", async () => {
    const { deps } = build({ res: resolution({ signature: signature({ expiresAt: new Date("2026-06-01") }) }), view });
    await expect(signDevis(deps, signPayload)).rejects.toBeInstanceOf(ValidationError);
  });

  it("devis expiré (dateValidite dépassée) → ValidationError même si le token est encore valide (OPE-61)", async () => {
    const res = resolution({ devisDateValidite: new Date("2026-06-10T00:00:00Z") }); // expiré avant NOW (15 juin)
    const { deps } = build({ res, view });
    await expect(signDevis(deps, signPayload)).rejects.toBeInstanceOf(ValidationError);
  });

  it("devis avec dateValidite future → signable normalement", async () => {
    const res = resolution({ devisDateValidite: new Date("2026-07-01T00:00:00Z") }); // futur
    const { deps } = build({ res, view });
    const out = await signDevis(deps, signPayload);
    expect(out.signature.statut).toBe("accepte");
  });

  it("succès : signe (accepte + IP/UA), notifie et email l'artisan", async () => {
    const { deps, notifications, email } = build({ res: resolution(), view });
    const out = await signDevis(deps, signPayload);
    expect(out.success).toBe(true);
    expect(out.signature.statut).toBe("accepte");
    expect(out.signature.ipAddress).toBe("1.2.3.4");
    expect(out.signature.signataireName).toBe("Jean Dupont");
    expect(notifications.emitted[0]).toMatchObject({ type: "succes", artisanId: 1 });
    expect(email.sent[0].to).toBe("pro@test.com");
    expect(email.sent[0].subject).toContain("accepté et signé");
  });

  it("envoie email de confirmation au client signataire après signature (GAP-G OPE-979)", async () => {
    const { deps, email } = build({ res: resolution(), view });
    await signDevis(deps, signPayload);
    const clientEmail = email.sent.find((m) => m.to === "jean@test.com");
    expect(clientEmail).toBeDefined();
    expect(clientEmail?.subject).toContain("DEV-1");
    expect(clientEmail?.subject).toContain("Confirmation");
    expect(clientEmail?.body).toContain("Toiture Pro");
  });

  it("notification/email best-effort : pas de vue → signature OK quand même", async () => {
    const { deps, email } = build({ res: resolution() }); // pas de seedView
    const out = await signDevis(deps, signPayload);
    expect(out.signature.statut).toBe("accepte");
    expect(email.sent).toHaveLength(0);
  });

  it("rate-limit atteint → TooManyRequestsError (anti brute-force token)", async () => {
    const { deps } = build({ res: resolution(), view, rateLimiter: new DenyRateLimiter() });
    await expect(signDevis(deps, signPayload)).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("documentHash non-null (64 hex) et déterministe quand la vue est disponible", async () => {
    const { deps } = build({ res: resolution(), view });
    const out = await signDevis(deps, signPayload);
    expect(out.signature.documentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.signature.documentHash).toBe(computeDevisHash(view));
  });

  it("documentHash null quand la vue n'est pas disponible (best-effort)", async () => {
    const { deps } = build({ res: resolution() }); // pas de seedView
    const out = await signDevis(deps, signPayload);
    expect(out.signature.documentHash).toBeNull();
  });
});

describe("refuseDevis (public)", () => {
  it("statut ≠ en_attente → ValidationError", async () => {
    const { deps } = build({ res: resolution({ signature: signature({ statut: "refuse" }) }), view });
    await expect(refuseDevis(deps, { token: "tok", motifRefus: null, ipAddress: "1.2.3.4", userAgent: "UA" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rate-limit atteint → TooManyRequestsError (anti flood refus)", async () => {
    const { deps } = build({ res: resolution(), view, rateLimiter: new DenyRateLimiter() });
    await expect(refuseDevis(deps, { token: "tok", motifRefus: null, ipAddress: "1.2.3.4", userAgent: "UA" })).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("succès : refuse (+ motif), notifie alerte et email l'artisan", async () => {
    const { deps, notifications, email } = build({ res: resolution(), view });
    const out = await refuseDevis(deps, { token: "tok", motifRefus: "Trop cher", ipAddress: "1.2.3.4", userAgent: "UA" });
    expect(out.signature.statut).toBe("refuse");
    expect(out.signature.motifRefus).toBe("Trop cher");
    expect(notifications.emitted[0]).toMatchObject({ type: "alerte" });
    expect(notifications.emitted[0].message).toContain("Trop cher");
    expect(email.sent[0].subject).toContain("refusé");
  });
});
