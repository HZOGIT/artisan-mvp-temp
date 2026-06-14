import { describe, it, expect } from "vitest";
import { FakePrevisionCARepository } from "./infra/prevision-ca-repository-fake";
import { creerPrevision, modifierPrevision, supprimerPrevision } from "./application/write-use-cases";
import { getPrevision, listPrevisions } from "./application/read-use-cases";
import { NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine previsions-ca (prévisions de CA par période ;
// CRUD catalogue camelCase ; mois/annee = période immuable ; pas d'unicité).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("previsions-ca — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD d'un autre tenant → NotFound/[]", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await creerPrevision(repo, A, { mois: 3, annee: 2026 });
    await expect(getPrevision(repo, B, p.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierPrevision(repo, B, p.id, { caRealise: "10.00" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerPrevision(repo, B, p.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listPrevisions(repo, B)).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await creerPrevision(repo, A, { mois: 3, annee: 2026 });
    expect(p.artisanId).toBe(1);
  });

  it("INV-3 : défauts montants '0.00' + confiance null quand absents", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await creerPrevision(repo, A, { mois: 3, annee: 2026 });
    expect(p.caPrevisionnel).toBe("0.00");
    expect(p.caRealise).toBe("0.00");
    expect(p.ecart).toBe("0.00");
    expect(p.confiance).toBeNull();
  });

  it("INV-4 : validation — mois 1-12, annee 2000-2100, montants ≥ 0, ecart signé, confiance 0-100", async () => {
    const repo = new FakePrevisionCARepository();
    await expect(creerPrevision(repo, A, { mois: 13, annee: 2026 })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerPrevision(repo, A, { mois: 3, annee: 1999 })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerPrevision(repo, A, { mois: 3, annee: 2026, caRealise: "-1.00" })).rejects.toBeInstanceOf(ValidationError);
    await expect(creerPrevision(repo, A, { mois: 3, annee: 2026, confiance: "101.00" })).rejects.toBeInstanceOf(ValidationError);
    // ecart signé accepté
    const ok = await creerPrevision(repo, A, { mois: 4, annee: 2026, ecart: "-50.00" });
    expect(ok.ecart).toBe("-50.00");
  });

  it("INV-5 : mois/annee immuables (modifier = montants/méthode/confiance) + pas d'unicité (doublons cohabitent)", async () => {
    const repo = new FakePrevisionCARepository();
    const p = await creerPrevision(repo, A, { mois: 5, annee: 2026, caPrevisionnel: "500.00" });
    const maj = await modifierPrevision(repo, A, p.id, { caRealise: "450.00" });
    expect(maj.caRealise).toBe("450.00");
    expect(maj.caPrevisionnel).toBe("500.00"); // préservé
    expect(maj.mois).toBe(5); // immuable
    expect(maj.annee).toBe(2026); // immuable
    // pas d'unicité : 2 prévisions même (mois, annee) cohabitent
    await creerPrevision(repo, A, { mois: 5, annee: 2026 });
    expect(await listPrevisions(repo, A)).toHaveLength(2);
  });
});
