import { describe, it, expect } from "vitest";
import { FakeRdvRepository } from "../infra/rdv-repository-fake";
import { FakeClientRepository } from "../../clients/infra/client-repository-fake";
import { listRdvs, getRdv, listRdvsAvecClient, getRdvStats, getRdvPendingCount } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const B = ctx(2);
const base = (over = {}) => ({ clientId: 100, titre: "Dépannage", dateProposee: new Date("2026-07-01T10:00:00Z"), ...over });

describe("rdv-en-ligne — read use-cases", () => {
  it("listRdvs renvoie les RDV du tenant", async () => {
    const repo = new FakeRdvRepository();
    await repo.create(A, base());
    expect(await listRdvs(repo, A)).toHaveLength(1);
    expect(await listRdvs(repo, B)).toEqual([]);
  });

  it("getRdv → NotFound si inexistant ou cross-tenant", async () => {
    const repo = new FakeRdvRepository();
    const r = await repo.create(A, base());
    expect((await getRdv(repo, A, r.id)).titre).toBe("Dépannage");
    await expect(getRdv(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getRdv(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  describe("listRdvsAvecClient — batch (anti N+1)", () => {
    it("enrichit chaque RDV avec son client en un seul appel batch", async () => {
      const rdvRepo = new FakeRdvRepository();
      const clientRepo = new FakeClientRepository();
      const client = await clientRepo.create(A, { nom: "Dupont", artisanId: 1 } as never);
      await rdvRepo.create(A, base({ clientId: client.id }));
      await rdvRepo.create(A, base({ clientId: client.id, titre: "Urgence" }));

      const result = await listRdvsAvecClient(rdvRepo, clientRepo, A);
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.client?.nom === "Dupont")).toBe(true);
    });

    it("client introuvable (cross-tenant ou inexistant) → client: null", async () => {
      const rdvRepo = new FakeRdvRepository();
      const clientRepo = new FakeClientRepository();
      await rdvRepo.create(A, base({ clientId: 9999 }));

      const [r] = await listRdvsAvecClient(rdvRepo, clientRepo, A);
      expect(r.client).toBeNull();
    });

    it("liste vide → renvoie [] sans appeler clientRepo", async () => {
      const rdvRepo = new FakeRdvRepository();
      const clientRepo = new FakeClientRepository();
      expect(await listRdvsAvecClient(rdvRepo, clientRepo, A)).toEqual([]);
    });
  });

  describe("getRdvStats — COUNT par statut (pas de full-list)", () => {
    it("compte correctement par statut sans full-list", async () => {
      const repo = new FakeRdvRepository();
      const r1 = await repo.create(A, base());
      await repo.create(A, base());
      await repo.setStatut(A, r1.id, "confirme");
      const stats = await getRdvStats(repo, A);
      expect(stats.enAttente).toBe(1);
      expect(stats.confirmes).toBe(1);
      expect(stats.refuses).toBe(0);
    });

    it("retourne 0 pour les statuts absents (tenant vide)", async () => {
      const repo = new FakeRdvRepository();
      const stats = await getRdvStats(repo, A);
      expect(stats).toEqual({ enAttente: 0, confirmes: 0, refuses: 0 });
    });

    it("scopé tenant — B ne compte pas les RDV de A", async () => {
      const repo = new FakeRdvRepository();
      await repo.create(A, base());
      await repo.create(A, base());
      const stats = await getRdvStats(repo, B);
      expect(stats.enAttente).toBe(0);
    });
  });

  describe("getRdvPendingCount — COUNT en_attente (pas de full-list)", () => {
    it("compte uniquement les en_attente", async () => {
      const repo = new FakeRdvRepository();
      const r1 = await repo.create(A, base());
      await repo.create(A, base());
      await repo.setStatut(A, r1.id, "confirme");
      expect(await getRdvPendingCount(repo, A)).toBe(1);
    });

    it("scopé tenant — B = 0 même si A en a", async () => {
      const repo = new FakeRdvRepository();
      await repo.create(A, base());
      expect(await getRdvPendingCount(repo, B)).toBe(0);
    });
  });
});
