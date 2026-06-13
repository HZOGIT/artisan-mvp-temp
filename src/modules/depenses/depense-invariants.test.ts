import { describe, it, expect } from "vitest";
import { FakeDepenseRepository } from "./infra/depense-repository-fake";
import { creerDepense, modifierDepense, supprimerDepense } from "./application/write-use-cases";
import { getDepense } from "./application/read-use-cases";
import { NotFoundError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine depenses (compta — sensible).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ dateDepense: "2026-06-15", categorie: "fournitures", montantHt: "100.00", ...over });

describe("depenses — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD d'un autre tenant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base());
    await expect(getDepense(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierDepense(repo, B, d.id, { description: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerDepense(repo, B, d.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await repo.list(B))).toEqual([]); // B ne voit rien de A
  });

  it("INV-2 : TVA dérivée serveur — montantTtc = montantHt + montantTva (jamais fournie par le client)", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base({ montantHt: "100.00", tauxTva: "20" }));
    expect(d.montantTva).toBe("20.00");
    expect(d.montantTtc).toBe("120.00");
    expect(Number(d.montantTtc)).toBeCloseTo(Number(d.montantHt) + Number(d.montantTva), 2);
    // recalcul à la modification du montant
    const m = await modifierDepense(repo, A, d.id, { montantHt: "200.00" });
    expect(m.montantTva).toBe("40.00");
    expect(m.montantTtc).toBe("240.00");
  });

  it("INV-3 : userId forcé — toujours l'utilisateur courant (créateur), jamais usurpable", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base());
    expect(d.userId).toBe(50); // ctx.userId
  });

  it("INV-4 : numérotation maîtrisée — numero auto DEP-…, scopé tenant, immuable via update", async () => {
    const repo = new FakeDepenseRepository();
    const d1 = await creerDepense(repo, A, base());
    const d2 = await creerDepense(repo, A, base());
    expect(d1.numero).toBe("DEP-00001");
    expect(d2.numero).toBe("DEP-00002");
    expect((await creerDepense(repo, B, base())).numero).toBe("DEP-00001"); // scopé tenant
    // `ModifierDepenseInput` n'expose pas `numero` → un modifier ne peut pas le changer
    const m = await modifierDepense(repo, A, d1.id, { description: "maj" });
    expect(m.numero).toBe("DEP-00001");
  });

  it("INV-5 : anti-IDOR-FK — chantier/intervention/client hors tenant → NotFound", async () => {
    const repo = new FakeDepenseRepository();
    repo.registerRef(B.artisanId, "client", 77);
    repo.registerRef(B.artisanId, "chantier", 88);
    repo.registerRef(B.artisanId, "intervention", 99);
    await expect(creerDepense(repo, A, base({ clientId: 77 }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(creerDepense(repo, A, base({ chantierId: 88 }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(creerDepense(repo, A, base({ interventionId: 99 }))).rejects.toBeInstanceOf(NotFoundError);
    // une FK du tenant courant est acceptée
    repo.registerRef(A.artisanId, "client", 5);
    expect((await creerDepense(repo, A, base({ clientId: 5 }))).clientId).toBe(5);
  });

  it("INV-6 : champs workflow inviolables via update — statut/rembourse/dateRemboursement intacts", async () => {
    const repo = new FakeDepenseRepository();
    const d = await creerDepense(repo, A, base());
    // `ModifierDepenseInput` n'expose ni statut ni rembourse ni dateRemboursement
    await modifierDepense(repo, A, d.id, { description: "Renommée" });
    const after = await getDepense(repo, A, d.id);
    expect(after.statut).toBe("brouillon");
    expect(after.rembourse).toBe(false);
    expect(after.dateRemboursement).toBeNull();
    expect(after.description).toBe("Renommée");
  });
});
