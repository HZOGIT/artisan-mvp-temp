import { describe, it, expect } from "vitest";
import { UnauthorizedError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import { PortalAccessRepositoryFake } from "../infra/portal-access-repository-fake";
import { PortalSchedulingReaderFake } from "../infra/portal-scheduling-reader-fake";
import { getCreneauxDisponibles, demanderRdv, getMesRdv, getSuiviChantiers, type PortalSchedulingDeps } from "./scheduling-use-cases";

const NOW = new Date("2026-06-15T09:00:00");

function access() {
  return new PortalAccessRepositoryFake({ accesses: [{ id: 1, clientId: 5, artisanId: 1, token: "good", email: "x", expiresAt: new Date("2026-12-31"), isActive: true, lastAccessAt: null, createdAt: NOW }] });
}

function build(over: Partial<PortalSchedulingDeps> = {}): { deps: PortalSchedulingDeps; notifs: any[]; scheduling: PortalSchedulingReaderFake } {
  const notifs: any[] = [];
  const scheduling = new PortalSchedulingReaderFake({ rdvByClient: { 5: [{ id: 9, titre: "RDV existant", description: null, dateProposee: NOW, dureeEstimee: 60, statut: "en_attente", motifRefus: null, urgence: "normale", createdAt: NOW }] }, chantiersByClient: { 5: [{ id: 3, reference: "CH-1", nom: "Chantier", description: null, adresse: null, statut: "en_cours", avancement: 40, dateDebut: "2026-06-15", dateFinPrevue: null, etapes: [{ id: 1, titre: "Étape 1", description: null, statut: "fait", pourcentage: 100, ordre: 1, dateDebut: null, dateFin: null, commentaire: null }] }] } });
  const deps: PortalSchedulingDeps = {
    access: access(),
    scheduling,
    clients: { getById: async () => ({ nom: "Dupont", prenom: "Jean" }) },
    notifications: { creer: async (_c, i) => { notifs.push(i); return {}; } },
    rateLimiter: { check: async () => true },
    ...over,
  };
  return { deps, notifs, scheduling };
}

describe("getCreneauxDisponibles", () => {
  it("token valide → liste de créneaux", async () => {
    const { deps } = build();
    const r = await getCreneauxDisponibles(deps, "good", NOW);
    expect(r.length).toBeGreaterThan(0);
  });
  it("token invalide → Unauthorized", async () => {
    const { deps } = build();
    await expect(getCreneauxDisponibles(deps, "bad", NOW)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

const futureDate = new Date(NOW.getTime() + 3 * 24 * 3600_000).toISOString();

describe("demanderRdv", () => {
  it("succès → crée le RDV + notifie l'artisan", async () => {
    const { deps, notifs, scheduling } = build();
    const rdv = await demanderRdv(deps, "good", { titre: "Fuite", urgence: "urgente", dateProposee: futureDate }, NOW);
    expect(rdv.titre).toBe("Fuite");
    expect(scheduling.created).toHaveLength(1);
    expect(notifs[0].titre).toContain("Jean Dupont");
  });
  it("date trop tôt (< +24h) → Validation", async () => {
    const { deps } = build();
    await expect(demanderRdv(deps, "good", { titre: "x", urgence: "normale", dateProposee: new Date(NOW.getTime() + 3600_000).toISOString() }, NOW)).rejects.toBeInstanceOf(ValidationError);
  });
  it("date invalide → Validation", async () => {
    const { deps } = build();
    await expect(demanderRdv(deps, "good", { titre: "x", urgence: "normale", dateProposee: "pas-une-date" }, NOW)).rejects.toBeInstanceOf(ValidationError);
  });
  it("rate-limit atteint → TooManyRequests (pas de création)", async () => {
    const { deps, scheduling } = build({ rateLimiter: { check: async () => false } });
    await expect(demanderRdv(deps, "good", { titre: "x", urgence: "normale", dateProposee: futureDate }, NOW)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(scheduling.created).toHaveLength(0);
  });
  it("token invalide → Unauthorized", async () => {
    const { deps } = build();
    await expect(demanderRdv(deps, "bad", { titre: "x", urgence: "normale", dateProposee: futureDate }, NOW)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("getMesRdv / getSuiviChantiers", () => {
  it("getMesRdv → RDV du client", async () => {
    const { deps } = build();
    expect((await getMesRdv(deps, "good", NOW)).map((r) => r.id)).toEqual([9]);
  });
  it("getSuiviChantiers → chantiers + étapes visibles", async () => {
    const { deps } = build();
    const r = await getSuiviChantiers(deps, "good", NOW);
    expect(r[0].reference).toBe("CH-1");
    expect(r[0].etapes).toHaveLength(1);
  });
  it("token invalide → Unauthorized", async () => {
    const { deps } = build();
    await expect(getMesRdv(deps, "bad", NOW)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
