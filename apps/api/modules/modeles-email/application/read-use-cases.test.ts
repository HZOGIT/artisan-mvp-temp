import { describe, it, expect } from "vitest";
import { FakeModeleEmailRepository } from "../infra/modele-email-repository-fake";
import { listModelesEmail, modelesParType, getModeleEmail } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ nom: "M", type: "envoi_devis" as const, sujet: "S", contenu: "C", ...over });

describe("modeles-email — read use-cases", () => {
  it("listModelesEmail renvoie les modèles du tenant", async () => {
    const repo = new FakeModeleEmailRepository();
    await repo.create(A, base());
    expect(await listModelesEmail(repo, A)).toHaveLength(1);
    expect(await listModelesEmail(repo, B)).toEqual([]);
  });

  it("modelesParType filtre par type (scopé) ; [] si aucun", async () => {
    const repo = new FakeModeleEmailRepository();
    await repo.create(A, base({ type: "relance_devis", nom: "R" }));
    expect((await modelesParType(repo, A, "relance_devis")).map((m) => m.nom)).toEqual(["R"]);
    expect(await modelesParType(repo, A, "autre")).toEqual([]);
  });

  it("getModeleEmail → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await repo.create(A, base());
    expect((await getModeleEmail(repo, A, m.id)).id).toBe(m.id);
    await expect(getModeleEmail(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getModeleEmail(repo, B, m.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
