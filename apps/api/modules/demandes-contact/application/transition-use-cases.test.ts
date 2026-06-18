import { describe, it, expect } from "vitest";
import { FakeDemandeContactRepository } from "../infra/demande-contact-repository-fake";
import { marquerContacte, convertir, marquerPerdu, peutTransitionner } from "./transition-use-cases";
import { ConflictError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const creer = (repo: FakeDemandeContactRepository) => repo.create(A, { nom: "Jean" });

describe("demandes-contact — transition use-cases (état machine + anti-IDOR conversion)", () => {
  it("peutTransitionner : table des transitions autorisées", () => {
    expect(peutTransitionner("nouveau", "contacte")).toBe(true);
    expect(peutTransitionner("nouveau", "converti")).toBe(true);
    expect(peutTransitionner("contacte", "converti")).toBe(true);
    expect(peutTransitionner("contacte", "perdu")).toBe(true);
    expect(peutTransitionner("nouveau", "nouveau")).toBe(false);
    expect(peutTransitionner("converti", "perdu")).toBe(false);
    expect(peutTransitionner("perdu", "contacte")).toBe(false);
  });

  it("marquerContacte depuis nouveau → contacte ; marquerPerdu → perdu", async () => {
    const repo = new FakeDemandeContactRepository();
    const d1 = await creer(repo);
    expect((await marquerContacte(repo, A, d1.id)).statut).toBe("contacte");
    const d2 = await creer(repo);
    expect((await marquerPerdu(repo, A, d2.id)).statut).toBe("perdu");
  });

  it("convertir : sans clientId → converti + clientId null ; avec clientId possédé → lié", async () => {
    const repo = new FakeDemandeContactRepository();
    repo.seedClient(1, 100);
    const d1 = await creer(repo);
    const sansClient = await convertir(repo, A, d1.id);
    expect(sansClient.statut).toBe("converti");
    expect(sansClient.clientId).toBeNull();
    const d2 = await creer(repo);
    const avecClient = await convertir(repo, A, d2.id, 100);
    expect(avecClient.statut).toBe("converti");
    expect(avecClient.clientId).toBe(100);
  });

  it("ANTI-IDOR conversion : convertir avec un clientId NON possédé → NotFound", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await creer(repo);
    await expect(convertir(repo, A, d.id, 999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INVARIANT : transitions depuis états terminaux (converti/perdu) → ConflictError", async () => {
    const repo = new FakeDemandeContactRepository();
    repo.seedClient(1, 100);
    const d = await creer(repo);
    await convertir(repo, A, d.id, 100);
    await expect(marquerContacte(repo, A, d.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(marquerPerdu(repo, A, d.id)).rejects.toBeInstanceOf(ConflictError);
    const d2 = await creer(repo);
    await marquerPerdu(repo, A, d2.id);
    await expect(convertir(repo, A, d2.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("transition sur une demande d'un autre tenant ou inexistante → NotFound", async () => {
    const repo = new FakeDemandeContactRepository();
    const d = await creer(repo);
    await expect(marquerContacte(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(marquerPerdu(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
