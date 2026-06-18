import { describe, it, expect } from "vitest";
import { FakeRdvRepository } from "./infra/rdv-repository-fake";
import { creerRdv, modifierRdv, supprimerRdv } from "./application/write-use-cases";
import { getRdv, listRdvs } from "./application/read-use-cases";
import { confirmerRdv, refuserRdv, annulerRdv } from "./application/transition-use-cases";
import { ConflictError, NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine rdv-en-ligne (RDV : CRUD + anti-IDOR + état machine).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ clientId: 100, titre: "Dépannage", dateProposee: new Date("2026-07-01T10:00:00Z"), ...over });
function repoA() {
  const repo = new FakeRdvRepository();
  repo.seedClient(1, 100); // client 100 possédé par l'artisan 1
  return repo;
}

describe("rdv-en-ligne — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + transitions d'un autre tenant → NotFound/[]", async () => {
    const repo = repoA();
    const r = await creerRdv(repo, A, base());
    await expect(getRdv(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierRdv(repo, B, r.id, { titre: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(confirmerRdv(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerRdv(repo, B, r.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listRdvs(repo, B)).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant", async () => {
    const repo = repoA();
    const r = await creerRdv(repo, A, base());
    expect(r.artisanId).toBe(1);
  });

  it("INV-3 : anti-IDOR clientId — creerRdv avec un clientId non possédé → NotFound", async () => {
    const repo = repoA();
    await expect(creerRdv(repo, A, base({ clientId: 999 }))).rejects.toBeInstanceOf(NotFoundError);
    const ok = await creerRdv(repo, A, base({ clientId: 100 }));
    expect(ok.clientId).toBe(100);
  });

  it("INV-4 : statut initial en_attente non usurpable ; update ne touche pas le statut", async () => {
    const repo = repoA();
    const r = await creerRdv(repo, A, base());
    expect(r.statut).toBe("en_attente");
    const maj = await modifierRdv(repo, A, r.id, { titre: "Modifié" });
    expect(maj.statut).toBe("en_attente"); // inchangé par update
  });

  it("INV-5 : état machine — terminaux refuse/annule → ConflictError ; refuser exige motif ; chemin nominal OK", async () => {
    const repo = repoA();
    // chemin nominal en_attente → confirme → annule
    const r1 = await creerRdv(repo, A, base());
    expect((await confirmerRdv(repo, A, r1.id)).statut).toBe("confirme");
    expect((await annulerRdv(repo, A, r1.id)).statut).toBe("annule");
    // état terminal : plus aucune transition
    await expect(confirmerRdv(repo, A, r1.id)).rejects.toBeInstanceOf(ConflictError);
    // refuser exige un motif
    const r2 = await creerRdv(repo, A, base());
    await expect(refuserRdv(repo, A, r2.id, " ")).rejects.toBeInstanceOf(ValidationError);
    const refuse = await refuserRdv(repo, A, r2.id, "Indisponible");
    expect(refuse.statut).toBe("refuse");
    await expect(annulerRdv(repo, A, r2.id)).rejects.toBeInstanceOf(ConflictError); // refuse = terminal
  });
});
