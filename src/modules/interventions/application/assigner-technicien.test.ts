import { describe, it, expect } from "vitest";
import { FakeInterventionRepository } from "../infra/intervention-repository-fake";
import { assignerTechnicien } from "./assigner-technicien";
import { NotFoundError, ForbiddenError } from "../../../shared/errors";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository } from "../../conges/application/conge-repository";
import type { Conge } from "../../conges/domain/conge";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const TECH = 7;

const conge = (over: Partial<Conge>): Conge =>
  ({ id: 1, artisanId: 1, technicienId: TECH, type: "conges_payes", dateDebut: "2026-09-01", dateFin: "2026-09-05", statut: "approuve", ...over } as unknown as Conge);

const congeRepoStub = (conges: Conge[]): ICongeRepository => ({ list: async () => conges } as unknown as ICongeRepository);

const base = (over = {}) => ({ clientId: 100, titre: "I", dateDebut: new Date("2026-09-02T08:00:00Z"), ...over });

describe("assignerTechnicien", () => {
  it("affecte le technicien + détecte double-booking + congé approuvé chevauchant", async () => {
    const repo = new FakeInterventionRepository();
    repo.registerRef(A.artisanId, "technicien", TECH);
    const cible = await repo.create(A, base({ titre: "Cible", dateDebut: new Date("2026-09-02T08:00:00Z"), dateFin: new Date("2026-09-02T12:00:00Z") }));
    // autre intervention du technicien, chevauchante, planifiee → conflit
    await repo.create(A, base({ titre: "Déjà", technicienId: TECH, dateDebut: new Date("2026-09-02T10:00:00Z"), dateFin: new Date("2026-09-02T14:00:00Z") }));

    const conges = [conge({ id: 9, dateDebut: "2026-09-01", dateFin: "2026-09-03", statut: "approuve" })]; // chevauche le 2/9
    const res = await assignerTechnicien(repo, congeRepoStub(conges), A, cible.id, TECH);

    expect(res.technicienId).toBe(TECH);
    expect(res.conflits.interventions.map((i) => i.titre)).toEqual(["Déjà"]);
    expect(res.conflits.conges.map((c) => c.id)).toEqual([9]);
  });

  it("exclut soi-même, les interventions non planifiées et les congés non approuvés/non chevauchants", async () => {
    const repo = new FakeInterventionRepository();
    repo.registerRef(A.artisanId, "technicien", TECH);
    const cible = await repo.create(A, base({ dateDebut: new Date("2026-09-02T08:00:00Z"), dateFin: new Date("2026-09-02T12:00:00Z") }));
    const conges = [
      conge({ id: 1, dateDebut: "2026-09-02", dateFin: "2026-09-02", statut: "en_attente" }), // pas approuvé
      conge({ id: 2, dateDebut: "2026-10-01", dateFin: "2026-10-05", statut: "approuve" }), // pas de chevauchement
    ];
    const res = await assignerTechnicien(repo, congeRepoStub(conges), A, cible.id, TECH);
    expect(res.conflits.interventions).toEqual([]); // seule la cible (exclue)
    expect(res.conflits.conges).toEqual([]);
  });

  it("intervention hors tenant → 404 ; technicien non possédé → 403", async () => {
    const repo = new FakeInterventionRepository();
    const i = await repo.create(A, base());
    // technicien non enregistré → Forbidden
    await expect(assignerTechnicien(repo, congeRepoStub([]), A, i.id, 999)).rejects.toBeInstanceOf(ForbiddenError);
    // intervention vue d'un autre tenant → NotFound
    repo.registerRef(B.artisanId, "technicien", TECH);
    await expectCrossTenantDenied(() => assignerTechnicien(repo, congeRepoStub([]), B, i.id, TECH));
    await expect(assignerTechnicien(repo, congeRepoStub([]), B, i.id, TECH)).rejects.toBeInstanceOf(NotFoundError);
  });
});
