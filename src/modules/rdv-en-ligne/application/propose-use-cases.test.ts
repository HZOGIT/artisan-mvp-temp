import { describe, it, expect } from "vitest";
import { proposerAutreCreneau } from "./propose-use-cases";
import { FakeRdvRepository } from "../infra/rdv-repository-fake";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 6610001;
const B = 6610002;

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// Seede un RDV "en_attente" pour le tenant et renvoie son id.
async function seedRdv(repo: FakeRdvRepository, artisanId: number) {
  const rdv = await repo.create(ctx(artisanId), {
    clientId: 42,
    titre: "Fuite cuisine",
    description: "sous évier",
    dateProposee: inDays(3),
    dureeEstimee: 90,
    urgence: "urgente",
  });
  return rdv.id;
}

describe("proposerAutreCreneau (use-case rdv-en-ligne, fake)", () => {
  it("RDV introuvable / hors tenant → NotFoundError (anti-IDOR)", async () => {
    const repo = new FakeRdvRepository();
    const id = await seedRdv(repo, A);
    await expect(proposerAutreCreneau(repo, ctx(A), 999999, inDays(5).toISOString())).rejects.toBeInstanceOf(NotFoundError);
    // B ne voit pas le RDV de A
    await expect(proposerAutreCreneau(repo, ctx(B), id, inDays(5).toISOString())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("date invalide / passé / > +2 ans → ValidationError (400)", async () => {
    const repo = new FakeRdvRepository();
    const id = await seedRdv(repo, A);
    await expect(proposerAutreCreneau(repo, ctx(A), id, "pas-une-date")).rejects.toBeInstanceOf(ValidationError);
    await expect(proposerAutreCreneau(repo, ctx(A), id, "2020-01-01T10:00:00.000Z")).rejects.toBeInstanceOf(ValidationError);
    await expect(proposerAutreCreneau(repo, ctx(A), id, inDays(366 * 3).toISOString())).rejects.toBeInstanceOf(ValidationError);
  });

  it("validation AVANT mutation : une date refusée ne refuse PAS le RDV initial", async () => {
    const repo = new FakeRdvRepository();
    const id = await seedRdv(repo, A);
    await expect(proposerAutreCreneau(repo, ctx(A), id, "pas-une-date")).rejects.toBeInstanceOf(ValidationError);
    const initial = await repo.getById(ctx(A), id);
    expect(initial?.statut).toBe("en_attente"); // intact, aucune transition parasite
    expect(initial?.motifRefus).toBeNull();
  });

  it("succès : refuse l'ancien (motif dédié) + crée un nouveau RDV au créneau proposé", async () => {
    const repo = new FakeRdvRepository();
    const id = await seedRdv(repo, A);
    const nouvelleDate = inDays(10);

    const nouveau = await proposerAutreCreneau(repo, ctx(A), id, nouvelleDate.toISOString());

    // Ancien RDV refusé avec le motif "autre créneau proposé"
    const ancien = await repo.getById(ctx(A), id);
    expect(ancien?.statut).toBe("refuse");
    expect(ancien?.motifRefus).toContain("un autre creneau");

    // Nouveau RDV : copie client/titre/description/durée/urgence, à la nouvelle date, en_attente
    expect(nouveau.id).not.toBe(id);
    expect(nouveau.statut).toBe("en_attente");
    expect(nouveau.clientId).toBe(42);
    expect(nouveau.titre).toBe("Fuite cuisine");
    expect(nouveau.description).toBe("sous évier");
    expect(nouveau.dureeEstimee).toBe(90);
    expect(nouveau.urgence).toBe("urgente");
    expect(nouveau.dateProposee.getTime()).toBe(nouvelleDate.getTime());
  });
});
