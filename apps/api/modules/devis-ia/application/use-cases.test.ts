import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { DevisIARepositoryFake } from "../infra/devis-ia-repository-fake";
import { listAnalyses, getAnalyse, createAnalyse, addPhoto, updateSuggestion, genererDevis } from "./use-cases";

const A: TenantContext = { artisanId: 1, userId: 1 };
const B: TenantContext = { artisanId: 2, userId: 2 };
const now = new Date();

function seed() {
  return new DevisIARepositoryFake({
    analyses: [
      { id: 10, artisanId: 1, clientId: 5, titre: "Salle de bain", description: null, statut: "termine", createdAt: now, updatedAt: now },
      { id: 20, artisanId: 2, clientId: 9, titre: "Autre tenant", description: null, statut: "en_attente", createdAt: now, updatedAt: now },
    ],
    photos: [{ id: 100, analyseId: 10, url: "http://x/p.jpg", description: null, ordre: 1, uploadedAt: now }],
    resultats: [{ id: 200, analyseId: 10, typeTravauxDetecte: "Plomberie", descriptionTravaux: null, urgence: "normale", confiance: "0.9", createdAt: now, suggestions: [{ id: 300, resultatId: 200, articleId: null, nomArticle: "Robinet", description: null, quantiteSuggeree: "1", unite: "u", prixEstime: "80", confiance: "0.8", selectionne: false, createdAt: now }] }],
    suggestions: [
      { id: 300, artisanId: 1, resultatId: 200, articleId: null, nomArticle: "Robinet", description: null, quantiteSuggeree: "1", unite: "u", prixEstime: "80", confiance: "0.8", selectionne: false, createdAt: now },
      { id: 400, artisanId: 2, resultatId: 999, articleId: null, nomArticle: "Autre", description: null, quantiteSuggeree: "1", unite: "u", prixEstime: "10", confiance: "0.5", selectionne: false, createdAt: now },
    ],
    ownedClientIds: [5],
  });
}

describe("listAnalyses / getAnalyse", () => {
  it("list ne renvoie que les analyses du tenant", async () => {
    expect((await listAnalyses(seed(), A)).map((a) => a.id)).toEqual([10]);
    expect((await listAnalyses(seed(), B)).map((a) => a.id)).toEqual([20]);
  });
  it("getAnalyse → détail enrichi (photos + résultats + suggestions)", async () => {
    const d = await getAnalyse(seed(), A, 10);
    expect(d.titre).toBe("Salle de bain");
    expect(d.photos).toHaveLength(1);
    expect(d.resultats[0].suggestions[0].nomArticle).toBe("Robinet");
  });
  it("getAnalyse d'un autre tenant → NotFound (anti-IDOR)", async () => {
    await expect(getAnalyse(seed(), A, 20)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("createAnalyse", () => {
  it("crée l'analyse ; client rattaché validé (anti-IDOR-FK)", async () => {
    const repo = seed();
    const a = await createAnalyse(repo, A, { clientId: 5, titre: "Nouvelle" });
    expect(a.titre).toBe("Nouvelle");
    expect(a.clientId).toBe(5);
  });
  it("client hors tenant → NotFound", async () => {
    await expect(createAnalyse(seed(), A, { clientId: 999 })).rejects.toBeInstanceOf(NotFoundError);
  });
  it("sans client → OK", async () => {
    expect((await createAnalyse(seed(), A, { titre: "X" })).clientId).toBeNull();
  });
});

describe("addPhoto", () => {
  it("ajoute une photo à une analyse possédée", async () => {
    const p = await addPhoto(seed(), A, 10, { url: "http://x/q.jpg" });
    expect(p.analyseId).toBe(10);
  });
  it("analyse d'un autre tenant → NotFound", async () => {
    await expect(addPhoto(seed(), A, 20, { url: "http://x/q.jpg" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateSuggestion (anti-IDOR comblé)", () => {
  it("met à jour une suggestion du tenant", async () => {
    const s = await updateSuggestion(seed(), A, 300, { selectionne: true, prixEstime: "90" });
    expect(s.selectionne).toBe(true);
    expect(s.prixEstime).toBe("90");
  });
  it("suggestion d'un AUTRE tenant → NotFound (le legacy n'avait AUCUNE garde)", async () => {
    await expect(updateSuggestion(seed(), A, 400, { selectionne: true })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("genererDevis", () => {
  it("analyse + client possédés → crée le devis depuis les suggestions sélectionnées", async () => {
    const repo = seed();
    await updateSuggestion(repo, A, 300, { selectionne: true }); // sélectionne la suggestion
    const res = await genererDevis(repo, A, { analyseId: 10, clientId: 5 });
    expect(res).not.toBeNull();
    expect(res!.montantEstime).toBeGreaterThan(0);
    expect(repo.createdDevis).toHaveLength(1);
  });
  it("aucune suggestion sélectionnée → null (parité legacy)", async () => {
    const repo = seed(); // suggestion 300 reste selectionne:false
    expect(await genererDevis(repo, A, { analyseId: 10, clientId: 5 })).toBeNull();
  });
  it("analyse hors tenant → NotFound", async () => {
    await expect(genererDevis(seed(), A, { analyseId: 20, clientId: 5 })).rejects.toBeInstanceOf(NotFoundError);
  });
  it("client hors tenant → NotFound (anti-IDOR-FK, fuite PII évitée)", async () => {
    await expect(genererDevis(seed(), A, { analyseId: 10, clientId: 999 })).rejects.toBeInstanceOf(NotFoundError);
  });
});
