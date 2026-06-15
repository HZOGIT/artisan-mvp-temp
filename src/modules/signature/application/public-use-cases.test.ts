import { describe, it, expect } from "vitest";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { Signature } from "../domain/signature";
import { FakeSignaturePublicReader } from "../infra/signature-public-reader-fake";
import type { SignatureDevisView, SignatureTokenResolution } from "./signature-public-reader";
import { getDevisForSignature } from "./public-use-cases";

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
  ...overrides,
});

const resolution = (overrides: Partial<SignatureTokenResolution> = {}): SignatureTokenResolution => ({
  signature: signature(),
  devisId: 10,
  artisanId: 1,
  dateVue: null,
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

function build(seed?: { token?: string; res?: SignatureTokenResolution; view?: SignatureDevisView }) {
  const reader = new FakeSignaturePublicReader();
  const token = seed?.token ?? "tok";
  if (seed?.res !== undefined) reader.seedResolution(token, seed.res);
  if (seed?.view !== undefined) reader.seedView(seed.res?.artisanId ?? 1, seed.res?.devisId ?? 10, seed.view);
  return { reader, deps: { reader, maintenant: () => NOW } };
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
    const reader = new FakeSignaturePublicReader();
    reader.seedResolution("tok", resolution());
    // pas de seedView
    await expect(getDevisForSignature({ reader, maintenant: () => NOW }, "tok")).rejects.toBeInstanceOf(NotFoundError);
  });
});
