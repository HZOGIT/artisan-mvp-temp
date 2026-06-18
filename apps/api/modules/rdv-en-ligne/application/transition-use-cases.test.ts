import { describe, it, expect } from "vitest";
import { FakeRdvRepository } from "../infra/rdv-repository-fake";
import { confirmerRdv, refuserRdv, annulerRdv, peutTransitionner } from "./transition-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ clientId: 100, titre: "Dépannage", dateProposee: new Date("2026-07-01T10:00:00Z"), ...over });

describe("rdv-en-ligne — transition use-cases (état machine)", () => {
  it("peutTransitionner : table des transitions autorisées", () => {
    expect(peutTransitionner("en_attente", "confirme")).toBe(true);
    expect(peutTransitionner("en_attente", "refuse")).toBe(true);
    expect(peutTransitionner("en_attente", "annule")).toBe(true);
    expect(peutTransitionner("confirme", "annule")).toBe(true);
    expect(peutTransitionner("confirme", "confirme")).toBe(false);
    expect(peutTransitionner("confirme", "refuse")).toBe(false);
    expect(peutTransitionner("refuse", "confirme")).toBe(false);
    expect(peutTransitionner("annule", "confirme")).toBe(false);
  });

  it("confirmer depuis en_attente → confirme", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    expect((await confirmerRdv(repo, A, r.id)).statut).toBe("confirme");
  });

  it("refuser sans motif → ValidationError ; avec motif → refuse + motifRefus", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    await expect(refuserRdv(repo, A, r.id, "  ")).rejects.toBeInstanceOf(ValidationError);
    const refuse = await refuserRdv(repo, A, r.id, "Créneau indisponible");
    expect(refuse.statut).toBe("refuse");
    expect(refuse.motifRefus).toBe("Créneau indisponible");
  });

  it("annuler depuis en_attente → annule ; annuler depuis confirme → annule", async () => {
    const repo = new FakeRdvRepository();
    const r1 = await repo.create(A, base());
    expect((await annulerRdv(repo, A, r1.id)).statut).toBe("annule");
    const r2 = await repo.create(A, base());
    await confirmerRdv(repo, A, r2.id);
    expect((await annulerRdv(repo, A, r2.id)).statut).toBe("annule");
  });

  it("INVARIANT : transitions depuis états terminaux (refuse/annule) → ConflictError", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    await refuserRdv(repo, A, r.id, "motif");
    await expect(confirmerRdv(repo, A, r.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(annulerRdv(repo, A, r.id)).rejects.toBeInstanceOf(ConflictError);

    const r2 = await repo.create(A, base());
    await annulerRdv(repo, A, r2.id);
    await expect(confirmerRdv(repo, A, r2.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("INVARIANT : confirmer un RDV déjà confirmé → ConflictError", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    await confirmerRdv(repo, A, r.id);
    await expect(confirmerRdv(repo, A, r.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("transition sur un RDV d'un autre tenant ou inexistant → NotFound", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    await expect(confirmerRdv(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(annulerRdv(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
