import { describe, it, expect } from "vitest";
import { genererCommandeDepuisDevisIA, sanitizeIaError, type CommandeIaDeps } from "./generer-depuis-devis-ia";
import { FakeLlmPort, FakeRateLimiter } from "../../../shared/ports";
import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { IDevisRepository } from "../../devis/application/devis-repository";
import type { IStockRepository } from "../../stocks/application/stock-repository";
import type { IArticleRepository } from "../../articles/application/article-repository";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };

// Stubs minimaux : le use-case ne lit que getById/listLignes (devis), list (stock/articles).
function devisStub(devis: unknown, lignes: unknown[]): IDevisRepository {
  return {
    getById: async () => devis as never,
    listLignes: async () => lignes as never,
  } as unknown as IDevisRepository;
}
const emptyStock = { list: async () => [] } as unknown as IStockRepository;
const articleStub = (rows: unknown[]) => ({ list: async () => rows as never }) as unknown as IArticleRepository;

function makeDeps(over: Partial<CommandeIaDeps> = {}): CommandeIaDeps {
  return {
    devisRepo: devisStub({ id: 5, statut: "accepte", numero: "DEV-2026-005", objet: "Toiture" }, [
      { designation: "Tuiles", quantite: "100", unite: "u", prixUnitaireHT: "1.20" },
    ]),
    stockRepo: emptyStock,
    articleRepo: articleStub([]),
    llm: new FakeLlmPort('{"lignes":[{"designation":"Tuiles terre cuite","quantite":100,"unite":"u","prixUnitaire":1.2,"tauxTVA":20}],"notes":"RAS"}'),
    rateLimiter: new FakeRateLimiter(),
    ...over,
  };
}

describe("sanitizeIaError", () => {
  it("tronque + masque les longs blobs/base64 (ne fuit pas la clé)", () => {
    expect(sanitizeIaError(new Error("data:image/png;base64,AAAABBBBCCCC=="))).toContain("[image]");
    expect(sanitizeIaError(new Error("k".repeat(300))).length).toBeLessThanOrEqual(201);
  });
});

describe("genererCommandeDepuisDevisIA", () => {
  it("propose des lignes depuis un devis accepté (non persisté) + devisNumero", async () => {
    const deps = makeDeps();
    const out = await genererCommandeDepuisDevisIA(deps, A, 5);
    expect(out.devisNumero).toBe("DEV-2026-005");
    expect(out.lignes).toHaveLength(1);
    expect(out.lignes[0].designation).toBe("Tuiles terre cuite");
    expect(out.lignes[0].quantite).toBe(100);
    expect(out.lignes[0].tauxTVA).toBe(20);
    expect(out.notes).toBe("RAS");
    expect((deps.llm as FakeLlmPort).prompts[0]).toContain("Tuiles");
  });

  it("filtre les lignes quantité=0 et matche articleId sur les articles artisan", async () => {
    const deps = makeDeps({
      articleRepo: articleStub([{ id: 42, designation: "Tuiles terre cuite", reference: "TLC-01" }]),
      llm: new FakeLlmPort(
        '{"lignes":[{"designation":"Tuiles terre cuite","quantite":100,"unite":"u","prixUnitaire":1.2,"tauxTVA":20},{"designation":"Déjà en stock","quantite":0,"unite":"u","prixUnitaire":5}]}',
      ),
    });
    const out = await genererCommandeDepuisDevisIA(deps, A, 5);
    expect(out.lignes).toHaveLength(1); // la ligne quantité 0 est retirée
    expect(out.lignes[0].articleId).toBe(42);
    expect(out.lignes[0].reference).toBe("TLC-01");
  });

  it("rate-limit IA atteint → 429 (avant toute lecture devis)", async () => {
    const limiter = new FakeRateLimiter();
    limiter.denyKey("ia:1");
    const deps = makeDeps({ rateLimiter: limiter });
    await expect(genererCommandeDepuisDevisIA(deps, A, 5)).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("devis introuvable → 404", async () => {
    const deps = makeDeps({ devisRepo: devisStub(null, []) });
    await expect(genererCommandeDepuisDevisIA(deps, A, 5)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("devis non accepté → 400", async () => {
    const deps = makeDeps({ devisRepo: devisStub({ id: 5, statut: "brouillon", numero: "DEV-X" }, []) });
    await expect(genererCommandeDepuisDevisIA(deps, A, 5)).rejects.toBeInstanceOf(ValidationError);
  });

  it("devis accepté sans ligne → proposition vide", async () => {
    const deps = makeDeps({ devisRepo: devisStub({ id: 5, statut: "accepte", numero: "DEV-9" }, []) });
    const out = await genererCommandeDepuisDevisIA(deps, A, 5);
    expect(out.lignes).toEqual([]);
    expect(out.notes).toBe("Devis sans ligne.");
  });

  it("réponse IA non-JSON → proposition vide (parse défensif)", async () => {
    const deps = makeDeps({ llm: new FakeLlmPort("désolé, je ne peux pas") });
    const out = await genererCommandeDepuisDevisIA(deps, A, 5);
    expect(out.lignes).toEqual([]);
  });
});
