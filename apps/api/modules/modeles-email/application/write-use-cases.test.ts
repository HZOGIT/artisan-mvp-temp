import { describe, it, expect } from "vitest";
import { FakeModeleEmailRepository } from "../infra/modele-email-repository-fake";
import { creerModeleEmail, modifierModeleEmail, supprimerModeleEmail } from "./write-use-cases";
import { listModelesEmail } from "./read-use-cases";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = ctx(1);
const base = (over = {}) => ({ nom: "M", type: "envoi_devis" as const, sujet: "S", contenu: "C", ...over });

// Nombre de modèles isDefault pour un type donné (chez A).
const nbDefauts = async (repo: FakeModeleEmailRepository, type: string) =>
  (await listModelesEmail(repo, A)).filter((m) => m.type === type && m.isDefault).length;

describe("modeles-email — write use-cases", () => {
  it("creerModeleEmail : validation nom/sujet/contenu/type ; artisanId scopé", async () => {
    const repo = new FakeModeleEmailRepository();
    await expect(creerModeleEmail(repo, A, base({ nom: " " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleEmail(repo, A, base({ sujet: "" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleEmail(repo, A, base({ contenu: "  " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerModeleEmail(repo, A, base({ type: "inexistant" as never }))).rejects.toBeInstanceOf(ValidationError);
    const ok = await creerModeleEmail(repo, A, base());
    expect(ok.artisanId).toBe(1);
  });

  it("modifierModeleEmail : NotFound si inexistant ; champs vides rejetés", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await creerModeleEmail(repo, A, base());
    await expect(modifierModeleEmail(repo, A, 999999, { nom: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierModeleEmail(repo, A, m.id, { sujet: " " })).rejects.toBeInstanceOf(ValidationError);
    const maj = await modifierModeleEmail(repo, A, m.id, { nom: "Nouveau" });
    expect(maj.nom).toBe("Nouveau");
  });

  it("supprimerModeleEmail : NotFound si inexistant", async () => {
    const repo = new FakeModeleEmailRepository();
    const m = await creerModeleEmail(repo, A, base());
    await supprimerModeleEmail(repo, A, m.id);
    await expect(supprimerModeleEmail(repo, A, m.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("INVARIANT (a) : créer un 2e modèle isDefault=true du même type retombe le 1er", async () => {
    const repo = new FakeModeleEmailRepository();
    const m1 = await creerModeleEmail(repo, A, base({ nom: "D1", isDefault: true }));
    await creerModeleEmail(repo, A, base({ nom: "D2", isDefault: true }));
    expect(await nbDefauts(repo, "envoi_devis")).toBe(1);
    const reload1 = (await listModelesEmail(repo, A)).find((m) => m.id === m1.id);
    expect(reload1?.isDefault).toBe(false); // le 1er a été retombé
  });

  it("INVARIANT (b) : update isDefault=true sur l'un retombe l'autre du même type", async () => {
    const repo = new FakeModeleEmailRepository();
    const m1 = await creerModeleEmail(repo, A, base({ nom: "D1", isDefault: true }));
    const m2 = await creerModeleEmail(repo, A, base({ nom: "D2", isDefault: false }));
    await modifierModeleEmail(repo, A, m2.id, { isDefault: true });
    expect(await nbDefauts(repo, "envoi_devis")).toBe(1);
    expect((await listModelesEmail(repo, A)).find((m) => m.id === m1.id)?.isDefault).toBe(false);
  });

  it("INVARIANT (c) : la règle est par type (un défaut envoi_devis n'affecte pas relance_devis)", async () => {
    const repo = new FakeModeleEmailRepository();
    await creerModeleEmail(repo, A, base({ type: "envoi_devis", nom: "ED", isDefault: true }));
    await creerModeleEmail(repo, A, base({ type: "relance_devis", nom: "RD", isDefault: true }));
    expect(await nbDefauts(repo, "envoi_devis")).toBe(1);
    expect(await nbDefauts(repo, "relance_devis")).toBe(1); // intact
  });

  it("INVARIANT (d) : update changeant le type applique l'unicité au nouveau type", async () => {
    const repo = new FakeModeleEmailRepository();
    const existantRelance = await creerModeleEmail(repo, A, base({ type: "relance_devis", nom: "RD", isDefault: true }));
    const m = await creerModeleEmail(repo, A, base({ type: "envoi_devis", nom: "ED", isDefault: false }));
    // bascule m vers relance_devis ET défaut → doit retomber existantRelance
    await modifierModeleEmail(repo, A, m.id, { type: "relance_devis", isDefault: true });
    expect(await nbDefauts(repo, "relance_devis")).toBe(1);
    expect((await listModelesEmail(repo, A)).find((x) => x.id === existantRelance.id)?.isDefault).toBe(false);
  });
});
