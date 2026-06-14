import { describe, it, expect } from "vitest";
import { FakeModeleEmailRepository } from "./infra/modele-email-repository-fake";
import { creerModeleEmail, modifierModeleEmail, supprimerModeleEmail } from "./application/write-use-cases";
import { getModeleEmail, listModelesEmail, modelesParType } from "./application/read-use-cases";
import { NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine modeles-email (catalogue de modèles d'email).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ nom: "M", type: "envoi_devis" as const, sujet: "S", contenu: "C", ...over });
const nbDefauts = async (repo: FakeModeleEmailRepository, ctx: TenantContext, type: string) =>
  (await listModelesEmail(repo, ctx)).filter((m) => m.type === type && m.isDefault).length;

describe("modeles-email — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + listByType d'un autre tenant → NotFound/[]", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await creerModeleEmail(repo, A, base({ type: "relance_devis" }));
    await expect(getModeleEmail(repo, B, m.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierModeleEmail(repo, B, m.id, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerModeleEmail(repo, B, m.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listModelesEmail(repo, B)).toEqual([]);
    expect(await modelesParType(repo, B, "relance_devis")).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant (jamais usurpable)", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await creerModeleEmail(repo, A, base());
    expect(m.artisanId).toBe(1);
  });

  it("INV-3 : validation — nom/sujet/contenu non vides ; type ∈ enum", async () => {
    const repo = new FakeModeleEmailRepository();
    await expect(creerModeleEmail(repo, A, base({ nom: " " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleEmail(repo, A, base({ sujet: "" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleEmail(repo, A, base({ contenu: "  " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleEmail(repo, A, base({ type: "inexistant" as never }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("INV-4 : update partiel — les champs non fournis sont préservés", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await creerModeleEmail(repo, A, base({ sujet: "Avant", contenu: "Garde", type: "envoi_facture" }));
    const maj = await modifierModeleEmail(repo, A, m.id, { sujet: "Après" });
    expect(maj.sujet).toBe("Après");
    expect(maj.contenu).toBe("Garde");
    expect(maj.type).toBe("envoi_facture");
  });

  it("INV-5 : unicité du défaut par (artisanId, type) — au plus un défaut par type, cloisonné par type", async () => {
    const repo = new FakeModeleEmailRepository();
    await creerModeleEmail(repo, A, base({ type: "envoi_devis", nom: "E1", isDefault: true }));
    await creerModeleEmail(repo, A, base({ type: "envoi_devis", nom: "E2", isDefault: true }));
    await creerModeleEmail(repo, A, base({ type: "rappel_paiement", nom: "RP", isDefault: true }));
    expect(await nbDefauts(repo, A, "envoi_devis")).toBe(1); // un seul défaut
    expect(await nbDefauts(repo, A, "rappel_paiement")).toBe(1); // règle par type → intact
    // le défaut de A n'affecte pas B
    expect(await nbDefauts(repo, B, "envoi_devis")).toBe(0);
  });
});
