import { describe, it, expect } from "vitest";
import { NotFoundError, TooManyRequestsError, ValidationError } from "../../../shared/errors";
import { FakeVisionPort } from "../../../shared/ports/fakes";
import type { TenantContext } from "../../../shared/tenant";
import { DevisIARepositoryFake } from "../infra/devis-ia-repository-fake";
import { analyserPhotos, type AnalyserPhotosDeps } from "./use-cases";

const A: TenantContext = { artisanId: 1, userId: 1 };
const now = new Date();
const OK_JSON = JSON.stringify({ travaux: [{ type: "Plomberie", description: "Remplacer le robinet", urgence: "moyenne", confiance: 90, articles: [{ nom: "Robinet mitigeur", description: "Grohe", quantite: 1, unite: "u", prixEstime: 120 }] }] });

function seed(photos = true) {
  return new DevisIARepositoryFake({
    analyses: [{ id: 10, artisanId: 1, clientId: 5, titre: "SDB", description: null, statut: "en_attente", createdAt: now, updatedAt: now }],
    photos: photos ? [{ id: 100, analyseId: 10, url: "data:image/jpeg;base64,AAAA", description: null, ordre: 1, uploadedAt: now }] : [],
  });
}

function build(over: Partial<AnalyserPhotosDeps> = {}, repo = seed()): { deps: AnalyserPhotosDeps; repo: DevisIARepositoryFake; vision: FakeVisionPort } {
  const vision = new FakeVisionPort(OK_JSON);
  const deps: AnalyserPhotosDeps = {
    repo,
    vision,
    rateLimiter: { check: async () => true },
    artisanReader: { getArtisan: async () => ({ id: 1, nomEntreprise: "ACME", email: null, specialite: "plombier" } as never) },
    bibliotheque: { list: async () => [{ id: 7, nom: "Robinet mitigeur chromé" }] },
    ...over,
  };
  return { deps, repo, vision };
}

describe("analyserPhotos", () => {
  it("succès → Vision multi-image + résultats + suggestions (match biblio) + statut termine", async () => {
    const { deps, repo, vision } = build();
    const res = await analyserPhotos(deps, A, 10);
    expect(res).toEqual({ success: true, nombreTravaux: 1 });
    // data:URL → bloc inline base64
    expect(vision.multiRequests[0].images[0]).toMatchObject({ mimeType: "image/jpeg", base64: "AAAA" });
    expect(vision.multiRequests[0].system).toContain("plomberie"); // prompt métier plombier injecté
    expect(repo.savedResultats).toHaveLength(1);
    expect(repo.savedSuggestions).toHaveLength(1);
    expect(repo.savedSuggestions[0].articleId).toBe(7); // matché à la bibliothèque
    expect(repo.statutHistory.map((s) => s.statut)).toEqual(["en_cours", "termine"]);
  });

  it("analyse hors tenant → NotFound", async () => {
    await expect(analyserPhotos(build({}, new DevisIARepositoryFake()).deps, A, 999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rate-limit IA → TooManyRequests", async () => {
    const { deps } = build({ rateLimiter: { check: async () => false } });
    await expect(analyserPhotos(deps, A, 10)).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("aucune photo → Validation + statut erreur", async () => {
    const { deps, repo } = build({}, seed(false));
    await expect(analyserPhotos(deps, A, 10)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.statutHistory.map((s) => s.statut)).toEqual(["en_cours", "erreur"]);
  });

  it("échec Vision → Error 500 (message sanitisé) + statut erreur", async () => {
    const { deps, repo } = build({ vision: new FakeVisionPort(OK_JSON, { throwError: new Error("boom data:image/png;base64,SECRET") }) });
    await expect(analyserPhotos(deps, A, 10)).rejects.toThrow(/Appel IA echoue/);
    expect(repo.statutHistory.at(-1)?.statut).toBe("erreur");
  });

  it("réponse IA non parsable → Error + statut erreur", async () => {
    const { deps, repo } = build({ vision: new FakeVisionPort("pas du json") });
    await expect(analyserPhotos(deps, A, 10)).rejects.toThrow(/non parsable|inattendu/);
    expect(repo.statutHistory.at(-1)?.statut).toBe("erreur");
  });
});
