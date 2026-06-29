import { describe, it, expect } from "vitest";
import { FakeDepenseRepository } from "../infra/depense-repository-fake";
import { creerDepense, modifierDepense, supprimerDepense, creerIndemniteKm, convertirTrajetEnIndemnite } from "./write-use-cases";
import type { CreerDepenseInput } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDeplacementRepository, Trajet } from "./deplacement-repository";
import type { DbClient } from "../../../shared/db";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over: Partial<CreerDepenseInput> = {}): CreerDepenseInput => ({
  dateDepense: "2026-06-15",
  categorie: "fournitures",
  montantHt: "100.00",
  ...over,
});

describe("depenses — use-cases d'écriture", () => {
  it("creerDepense dérive la TVA et le TTC côté serveur", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base({ montantHt: "100.00", tauxTva: "20" }));
    expect(d.montantTva).toBe("20.00");
    expect(d.montantTtc).toBe("120.00");
    expect(d.tauxTva).toBe("20");
  });

  it("creerDepense applique le taux par défaut 20% si absent", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base({ montantHt: "50" }));
    expect(d.montantTva).toBe("10.00");
    expect(d.montantTtc).toBe("60.00");
  });

  it("creerDepense force userId au créateur (ctx.userId), jamais usurpable", async () => {
    const repo = new FakeDepenseRepository();
    // Tentative d'injecter un userId arbitraire : le type l'exclut, mais on vérifie le forçage.
    const d = await creerDepense(repo, A, base());
    expect(d.userId).toBe(A.userId);
  });

  it("creerDepense scope la dépense au tenant courant", async () => {
    const repo = new FakeDepenseRepository();
    await creerDepense(repo, A, base({ description: "Chez A" }));
    await creerDepense(repo, B, base({ description: "Chez B" }));
    expect((await repo.list(A)).map((d) => d.description)).toEqual(["Chez A"]);
  });

  it("creerDepense génère le numéro côté serveur (DEP-00001, incrémenté), jamais fourni par le client", async () => {
    const repo = new FakeDepenseRepository();
    const d1 = await creerDepense(repo, A, base());
    const d2 = await creerDepense(repo, A, base());
    expect(d1.numero).toBe("DEP-00001");
    expect(d2.numero).toBe("DEP-00002");
    // Numérotation scopée tenant : un autre tenant repart de DEP-00001.
    const dB = await creerDepense(repo, B, base());
    expect(dB.numero).toBe("DEP-00001");
  });

  it("creerDepense — catégorie vide → Validation", async () => {
    const repo = new FakeDepenseRepository();
    await expect(creerDepense(repo, A, base({ categorie: "" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerDepense — montant HT négatif → Validation", async () => {
    const repo = new FakeDepenseRepository();
    await expect(creerDepense(repo, A, base({ montantHt: "-1" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerDepense — taux TVA hors [0,100] → Validation", async () => {
    const repo = new FakeDepenseRepository();
    await expect(creerDepense(repo, A, base({ tauxTva: "150" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerDepense — clientId hors tenant → NotFound (anti-IDOR-FK)", async () => {
    const repo = new FakeDepenseRepository();
    // Le client 77 appartient à B, pas à A → A ne peut pas le lier.
    repo.registerRef(B.artisanId, "client", 77);
    await expectCrossTenantDenied(() => creerDepense(repo, A, base({ clientId: 77 })));
    await expect(creerDepense(repo, A, base({ clientId: 77 }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creerDepense — chantierId du tenant → OK", async () => {
    const repo = new FakeDepenseRepository();
    repo.registerRef(A.artisanId, "chantier", 5);
    const d = await creerDepense(repo, A, base({ chantierId: 5 }));
    expect(d.chantierId).toBe(5);
  });

  it("creerDepense — interventionId hors tenant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    repo.registerRef(B.artisanId, "intervention", 9);
    await expect(creerDepense(repo, A, base({ interventionId: 9 }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierDepense recalcule la TVA quand montantHt change", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base({ montantHt: "100", tauxTva: "20" }));
    const m = await modifierDepense(repo, A, d.id, { montantHt: "200" });
    expect(m.montantTva).toBe("40.00");
    expect(m.montantTtc).toBe("240.00");
  });

  it("modifierDepense recalcule la TVA quand le taux change", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base({ montantHt: "100", tauxTva: "20" }));
    const m = await modifierDepense(repo, A, d.id, { tauxTva: "10" });
    expect(m.montantTva).toBe("10.00");
    expect(m.montantTtc).toBe("110.00");
  });

  it("modifierDepense ne recalcule pas si ni montant ni taux ne changent", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base({ montantHt: "100", tauxTva: "20" }));
    const m = await modifierDepense(repo, A, d.id, { description: "maj note" });
    expect(m.montantTtc).toBe("120.00");
    expect(m.description).toBe("maj note");
  });

  it("modifierDepense — montant négatif → Validation", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base());
    await expect(modifierDepense(repo, A, d.id, { montantHt: "-5" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierDepense — FK rebranchée hors tenant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base());
    repo.registerRef(B.artisanId, "chantier", 12);
    await expect(modifierDepense(repo, A, d.id, { chantierId: 12 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("modifierDepense — dépense d'un autre tenant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base());
    await expectCrossTenantDenied(() => modifierDepense(repo, B, d.id, { description: "intrusion" }));
    await expect(modifierDepense(repo, B, d.id, { description: "intrusion" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("garde verrouillage — creerDepense refuse si dateDepense ≤ lockDate", async () => {
    const repo = new FakeDepenseRepository();
    await expect(creerDepense(repo, A, base({ dateDepense: "2024-01-15" }), "2024-03-31")).rejects.toBeInstanceOf(ValidationError);
    await expect(creerDepense(repo, A, base({ dateDepense: "2024-03-31" }), "2024-03-31")).rejects.toBeInstanceOf(ValidationError);
    await expect(creerDepense(repo, A, base({ dateDepense: "2024-04-01" }), "2024-03-31")).resolves.toBeDefined();
  });

  it("garde verrouillage — modifierDepense refuse si nouvelle dateDepense ≤ lockDate", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base({ dateDepense: "2024-04-15" }));
    await expect(modifierDepense(repo, A, d.id, { dateDepense: "2024-02-01" }, "2024-03-31")).rejects.toBeInstanceOf(ValidationError);
    await expect(modifierDepense(repo, A, d.id, { dateDepense: "2024-04-02" }, "2024-03-31")).resolves.toBeDefined();
  });

  it("supprimerDepense — dépense du tenant → OK", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base());
    await supprimerDepense(repo, A, d.id);
    expect(await repo.list(A)).toEqual([]);
  });

  it("supprimerDepense — dépense d'un autre tenant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base());
    await expectCrossTenantDenied(() => supprimerDepense(repo, B, d.id));
    await expect(supprimerDepense(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("depenses — creerIndemniteKm", () => {
  it("calcule le montant (km × tarif), sans TVA, remboursable, numéro serveur", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerIndemniteKm(repo, A, { dateDepense: "2026-06-15", kilometres: 100, tarifKm: 0.5 });
    expect(d.montantHt).toBe("50.00"); // 100 × 0.5
    expect(d.montantTtc).toBe("50.00"); // pas de TVA (taux 0)
    expect(d.montantTva).toBe("0.00");
    expect(d.tvaDeductible).toBe(false);
    expect(d.remboursable).toBe(true);
    expect(d.fournisseur).toBe("Indemnités kilométriques");
    expect(d.numero).toMatch(/^DEP-/); // généré serveur
  });

  it("tarif par défaut 0.529 + motif dans la description", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerIndemniteKm(repo, A, { dateDepense: "2026-06-15", kilometres: 10, motif: "RDV client" });
    expect(d.montantHt).toBe("5.29"); // 10 × 0.529
    expect(d.description).toContain("RDV client");
    expect(d.description).toContain("0.529");
  });

  it("km ≤ 0 → ValidationError", async () => {
    const repo = new FakeDepenseRepository();
    await expect(creerIndemniteKm(repo, A, { dateDepense: "2026-06-15", kilometres: 0 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("anti-IDOR : clientId/chantierId hors tenant → NotFound (via creerDepense)", async () => {
    const repo = new FakeDepenseRepository();
    await expect(creerIndemniteKm(repo, A, { dateDepense: "2026-06-15", kilometres: 10, clientId: 999 })).rejects.toBeInstanceOf(NotFoundError);
    // avec FK enregistrée comme appartenant au tenant → OK
    repo.registerRef(1, "client", 555);
    const d = await creerIndemniteKm(repo, A, { dateDepense: "2026-06-15", kilometres: 10, clientId: 555 });
    expect(d.clientId).toBe(555);
  });
});

/** Fake minimal pour les tests de convertirTrajetEnIndemnite (L1 — sans DB). */
class FakeDeplacementRepository implements IDeplacementRepository {
  private store: Trajet[] = [];
  private depenseIds = new Map<number, number>();

  seed(t: Trajet) { this.store.push(t); }

  async getParTenant(_ctx: TenantContext, id: number): Promise<Trajet | null> {
    const t = this.store.find((x) => x.id === id) ?? null;
    if (!t) return null;
    return { ...t, depenseId: this.depenseIds.get(id) ?? t.depenseId };
  }

  async listParTenant(_ctx: TenantContext): Promise<Trajet[]> { return this.store; }

  async setDepenseId(_ctx: TenantContext, id: number, depenseId: number): Promise<void> {
    this.depenseIds.set(id, depenseId);
  }

  withDb(_db: DbClient): FakeDeplacementRepository { return this; }
}

const trajetBase = (): Trajet => ({
  id: 1,
  technicienId: 10,
  interventionId: null,
  dateDebut: new Date("2026-06-15"),
  distanceKm: "42.5",
  adresseDepart: "Paris",
  adresseArrivee: "Lyon",
  depenseId: null,
});

describe("convertirTrajetEnIndemnite", () => {
  it("L1 — calcule le montant (km × taux) et crée la dépense IK", async () => {
    const repo = new FakeDepenseRepository();
    const deplRepo = new FakeDeplacementRepository();
    deplRepo.seed(trajetBase());
    const d = await convertirTrajetEnIndemnite(repo, deplRepo, A, { deplacementId: 1, tarifKm: 0.5 });
    expect(d.montantHt).toBe("21.25"); // round2(42.5 × 0.5)
    expect(d.tvaDeductible).toBe(false);
    expect(d.remboursable).toBe(true);
  });

  it("L1 — idempotent : 2e appel retourne la même dépense, pas de doublon", async () => {
    const repo = new FakeDepenseRepository();
    const deplRepo = new FakeDeplacementRepository();
    deplRepo.seed(trajetBase());
    const d1 = await convertirTrajetEnIndemnite(repo, deplRepo, A, { deplacementId: 1, tarifKm: 0.5 });
    const d2 = await convertirTrajetEnIndemnite(repo, deplRepo, A, { deplacementId: 1, tarifKm: 0.5 });
    expect(d2.id).toBe(d1.id);
    expect((await repo.list(A)).length).toBe(1);
  });

  it("L1 — trajet introuvable → NotFoundError", async () => {
    const repo = new FakeDepenseRepository();
    const deplRepo = new FakeDeplacementRepository();
    await expect(convertirTrajetEnIndemnite(repo, deplRepo, A, { deplacementId: 99 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("L1 — trajet sans distanceKm → ValidationError", async () => {
    const repo = new FakeDepenseRepository();
    const deplRepo = new FakeDeplacementRepository();
    deplRepo.seed({ ...trajetBase(), distanceKm: null });
    await expect(convertirTrajetEnIndemnite(repo, deplRepo, A, { deplacementId: 1 })).rejects.toBeInstanceOf(ValidationError);
  });
});
