import { describe, it, expect } from "vitest";
import {
  getBibliotheque,
  rechercherBibliotheque,
  creerArticleBibliotheque,
  modifierArticleBibliotheque,
  supprimerArticleBibliotheque,
  importerArticlesBibliotheque,
} from "./bibliotheque-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { BibliothequeReader, BibliothequeArticle, BibliothequeFiltre } from "./bibliotheque-reader";
import type { BibliothequeWriter, CreateBibliothequeInput, UpdateBibliothequeInput } from "./bibliotheque-writer";

// Catalogue partagé (référentiel global, sans tenant) : use-cases minces qui délèguent à reader/writer.
// On vérifie la délégation (passage des args) et la SEULE règle métier locale : update inexistant → NotFound.

function article(over: Partial<BibliothequeArticle> = {}): BibliothequeArticle {
  return {
    id: 1, metier: "plomberie", categorie: "sanitaire", sousCategorie: "robinet",
    nom: "Mitigeur", description: null, prixBase: "59.90", unite: "u",
    tauxTVA: "20", prixRevient: null, dureeMoyenneMinutes: null, visible: true, ...over,
  };
}

// Reader en mémoire qui enregistre les arguments reçus (vérif délégation).
class FakeReader implements BibliothequeReader {
  lastList?: BibliothequeFiltre;
  lastSearch?: { query: string; metier?: string };
  constructor(private readonly rows: BibliothequeArticle[]) {}
  async list(filtre?: BibliothequeFiltre) { this.lastList = filtre; return this.rows; }
  async search(query: string, metier?: string) { this.lastSearch = { query, metier }; return this.rows; }
}

// Writer en mémoire (store réel : create/update/delete/importMany).
class FakeWriter implements BibliothequeWriter {
  store: BibliothequeArticle[] = [];
  private seq = 0;
  async create(input: CreateBibliothequeInput) {
    const a = article({ id: ++this.seq, ...input });
    this.store.push(a);
    return a;
  }
  async update(id: number, input: UpdateBibliothequeInput) {
    const i = this.store.findIndex((a) => a.id === id);
    if (i === -1) return null;
    this.store[i] = { ...this.store[i], ...input };
    return this.store[i];
  }
  async delete(id: number) {
    const before = this.store.length;
    this.store = this.store.filter((a) => a.id !== id);
    return this.store.length < before;
  }
  async importMany(inputs: CreateBibliothequeInput[]) {
    for (const inp of inputs) await this.create(inp);
    return inputs.length;
  }
}

describe("bibliotheque-use-cases (catalogue partagé, délégation reader/writer)", () => {
  it("getBibliotheque transmet le filtre au reader et renvoie sa liste", async () => {
    const reader = new FakeReader([article({ id: 7 })]);
    const filtre = { metier: "plomberie", categorie: "sanitaire" };
    const res = await getBibliotheque(reader, filtre);
    expect(res.map((a) => a.id)).toEqual([7]);
    expect(reader.lastList).toEqual(filtre);
  });

  it("rechercherBibliotheque transmet query + métier au reader", async () => {
    const reader = new FakeReader([]);
    await rechercherBibliotheque(reader, "mitig", "plomberie");
    expect(reader.lastSearch).toEqual({ query: "mitig", metier: "plomberie" });
  });

  it("creerArticleBibliotheque délègue au writer.create", async () => {
    const writer = new FakeWriter();
    const created = await creerArticleBibliotheque(writer, {
      nom: "Coude", unite: "u", prixBase: "2.50", categorie: "raccord", sousCategorie: "pvc", metier: "plomberie",
    });
    expect(created.nom).toBe("Coude");
    expect(writer.store.length).toBe(1);
  });

  it("modifierArticleBibliotheque : existant → màj ; inexistant → NotFoundError", async () => {
    const writer = new FakeWriter();
    const a = await creerArticleBibliotheque(writer, {
      nom: "Coude", unite: "u", prixBase: "2.50", categorie: "raccord", sousCategorie: "pvc", metier: "plomberie",
    });
    const maj = await modifierArticleBibliotheque(writer, a.id, { nom: "Coude 90°" });
    expect(maj.nom).toBe("Coude 90°");
    await expect(modifierArticleBibliotheque(writer, 999999, { nom: "X" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerArticleBibliotheque délègue au writer.delete (idempotent, ne lève pas)", async () => {
    const writer = new FakeWriter();
    const a = await creerArticleBibliotheque(writer, {
      nom: "Coude", unite: "u", prixBase: "2.50", categorie: "raccord", sousCategorie: "pvc", metier: "plomberie",
    });
    await expect(supprimerArticleBibliotheque(writer, a.id)).resolves.toBeUndefined();
    expect(writer.store.length).toBe(0);
    // id inexistant : pas d'erreur (idempotent)
    await expect(supprimerArticleBibliotheque(writer, 999999)).resolves.toBeUndefined();
  });

  it("importerArticlesBibliotheque renvoie { imported: n }", async () => {
    const writer = new FakeWriter();
    const inputs: CreateBibliothequeInput[] = [
      { nom: "A", unite: "u", prixBase: "1", categorie: "c", sousCategorie: "s", metier: "m" },
      { nom: "B", unite: "u", prixBase: "2", categorie: "c", sousCategorie: "s", metier: "m" },
    ];
    expect(await importerArticlesBibliotheque(writer, inputs)).toEqual({ imported: 2 });
    expect(writer.store.length).toBe(2);
  });
});
