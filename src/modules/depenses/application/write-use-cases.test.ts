import { describe, it, expect } from "vitest";
import { FakeDepenseRepository } from "../infra/depense-repository-fake";
import { creerDepense, modifierDepense, supprimerDepense } from "./write-use-cases";
import type { CreerDepenseInput } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

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
