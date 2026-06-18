import { describe, it, expect } from "vitest";
import { FakeDevisRepository } from "../infra/devis-repository-fake";
import { getDevisNonSignes, type DevisNonSignesDeps } from "./get-devis-non-signes";
import type { TenantContext } from "../../../shared/tenant";
import type { ClientInfo } from "../../../shared/readers/contact-readers";
import type { DevisSignatureInfo } from "./devis-signature-reader";

const A: TenantContext = { artisanId: 1, userId: 10 };
const CLIENT: ClientInfo = { id: 100, nom: "Durand", prenom: "Marie", email: "marie@client.fr" };
const now = new Date("2026-06-14T00:00:00Z");

function makeDeps(devisRepo: FakeDevisRepository, signature: DevisSignatureInfo | null = null): DevisNonSignesDeps {
  return {
    devisRepo,
    clientReader: { getClient: async () => CLIENT },
    signatureReader: { getByDevisId: async () => signature },
    maintenant: () => now,
  };
}

async function seed(repo: FakeDevisRepository, statut: "brouillon" | "envoye" | "accepte", dateDevis: Date) {
  const d = await repo.create(A, { clientId: CLIENT.id, numero: "DEV-00001" });
  if (statut !== "brouillon") repo.setStatutForTest(d.id, statut);
  repo.setDateDevisForTest(d.id, dateDevis);
  return d;
}

describe("getDevisNonSignes", () => {
  it("renvoie les devis non signés ≥ joursMinimum, enrichis client + signature", async () => {
    const repo = new FakeDevisRepository();
    const ancien = await seed(repo, "envoye", new Date("2026-05-01T00:00:00Z")); // 44 j
    await seed(repo, "brouillon", new Date("2026-06-13T00:00:00Z")); // 1 j → exclu
    await seed(repo, "accepte", new Date("2026-01-01T00:00:00Z")); // signé → exclu de listNonSignes

    const sig: DevisSignatureInfo = { id: 9, token: "tok-abc", createdAt: new Date("2026-06-04T00:00:00Z") };
    const out = await getDevisNonSignes(makeDeps(repo, sig), A, { joursMinimum: 7 });
    expect(out).toHaveLength(1);
    expect(out[0].devis.id).toBe(ancien.id);
    expect(out[0].client?.nom).toBe("Marie Durand");
    expect(out[0].signature?.token).toBe("tok-abc");
    expect(out[0].joursDepuisCreation).toBe(44);
    expect(out[0].joursDepuisEnvoi).toBe(10); // 14 juin - 4 juin
  });

  it("signature absente → signature null + joursDepuisEnvoi null", async () => {
    const repo = new FakeDevisRepository();
    await seed(repo, "envoye", new Date("2026-05-01T00:00:00Z"));
    const out = await getDevisNonSignes(makeDeps(repo, null), A, { joursMinimum: 7 });
    expect(out[0].signature).toBeNull();
    expect(out[0].joursDepuisEnvoi).toBeNull();
  });
});
