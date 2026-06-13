import { describe, it, expect, beforeEach } from "vitest";
import { FakeVehiculeRepository } from "../infra/vehicule-repository-fake";
import { listVehicules, getVehiculeById } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("vehicules — use-cases lecture (repo mocké)", () => {
  let repo: FakeVehiculeRepository;

  beforeEach(async () => {
    repo = new FakeVehiculeRepository();
    await repo.create(A, { immatriculation: "AA-1" });
    await repo.create(A, { immatriculation: "AA-2" });
    await repo.create(B, { immatriculation: "BB-1" });
  });

  it("listVehicules ne renvoie que les véhicules du tenant", async () => {
    expect((await listVehicules(repo, A)).map((v) => v.immatriculation).sort()).toEqual(["AA-1", "AA-2"]);
    expect((await listVehicules(repo, B)).map((v) => v.immatriculation)).toEqual(["BB-1"]);
  });

  it("getVehiculeById renvoie le véhicule du tenant", async () => {
    const [v] = await listVehicules(repo, A);
    expect((await getVehiculeById(repo, A, v.id)).id).toBe(v.id);
  });

  it("getVehiculeById sur une ressource d'un autre tenant → NotFoundError", async () => {
    const [vA] = await listVehicules(repo, A);
    await expect(getVehiculeById(repo, B, vA.id)).rejects.toBeInstanceOf(NotFoundError);
    // et via le harnais d'isolation réutilisable
    await expectCrossTenantDenied(() => getVehiculeById(repo, B, vA.id));
  });

  it("getVehiculeById sur un id inexistant → NotFoundError", async () => {
    await expect(getVehiculeById(repo, A, 99999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
