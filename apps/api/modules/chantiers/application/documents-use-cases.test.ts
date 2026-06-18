import { describe, it, expect } from "vitest";
import { FakeChantierRepository } from "../infra/chantier-repository-fake";
import { getDocumentsChantier, ajouterDocument, supprimerDocument } from "./documents-use-cases";
import { creerChantier } from "./write-use-cases";
import { NotFoundError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const CLIENT_A = 500;

async function repoAvecChantier(): Promise<{ repo: FakeChantierRepository; chantierId: number }> {
  const repo = new FakeChantierRepository();
  repo.registerClient(1, CLIENT_A);
  const ch = await creerChantier(repo, A, { clientId: CLIENT_A, reference: "CH-1", nom: "Chantier" });
  return { repo, chantierId: ch.id };
}

describe("chantiers — documents use-cases", () => {
  it("ajouterDocument + getDocumentsChantier : scopés via le chantier parent, défaut type=autre", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const d = await ajouterDocument(repo, A, { chantierId, nom: "Plan", url: "https://x/plan.pdf" });
    expect(d.nom).toBe("Plan");
    expect(d.type).toBe("autre");
    expect(d.taille).toBeNull();
    const list = await getDocumentsChantier(repo, A, chantierId);
    expect(list).toHaveLength(1);
    // isolation : un autre tenant ne voit pas / n'ajoute pas sous le chantier de A
    await expectCrossTenantDenied(() => getDocumentsChantier(repo, B, chantierId));
    await expect(ajouterDocument(repo, B, { chantierId, nom: "X", url: "https://x/x.pdf" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ajouterDocument : type explicite + taille conservés ; chantier inexistant → 404", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const d = await ajouterDocument(repo, A, { chantierId, nom: "Photo", type: "photo", url: "https://x/p.jpg", taille: 2048 });
    expect(d.type).toBe("photo");
    expect(d.taille).toBe(2048);
    await expect(ajouterDocument(repo, A, { chantierId: 999999, nom: "X", url: "https://x/x.pdf" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerDocument : scopé via le chantier parent ; anti-IDOR ; idempotent", async () => {
    const { repo, chantierId } = await repoAvecChantier();
    const d = await ajouterDocument(repo, A, { chantierId, nom: "Plan", url: "https://x/plan.pdf" });
    // B ne peut pas supprimer le document de A
    await expect(supprimerDocument(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
    await supprimerDocument(repo, A, d.id);
    expect(await getDocumentsChantier(repo, A, chantierId)).toHaveLength(0);
    // idempotent : re-supprimer lève 404 (document déjà absent)
    await expect(supprimerDocument(repo, A, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
