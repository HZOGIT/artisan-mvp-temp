import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { FakeDevisReader } from "../infra/devis-reader-fake";
import { convertirDevisEnFacture } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { ConflictError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { DevisReadModel, DevisLigneReadModel } from "./devis-reader";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const devisAccepte = (over: Partial<DevisReadModel> = {}): DevisReadModel => ({
  id: 7,
  artisanId: 1,
  clientId: 100,
  numero: "DEV-00001",
  statut: "accepte",
  objet: "Réno",
  referenceClient: "CMD-42",
  conditionsPaiement: "30 jours",
  notes: "n",
  totalHT: "200.00",
  totalTVA: "40.00",
  totalTTC: "240.00",
  ...over,
});

const ligne = (over: Partial<DevisLigneReadModel> = {}): DevisLigneReadModel => ({
  ordre: 0,
  reference: null,
  designation: "Pose",
  description: null,
  quantite: "2.00",
  unite: "unité",
  prixUnitaireHT: "100.00",
  tauxTVA: "20.00",
  montantHT: "200.00",
  montantTVA: "40.00",
  montantTTC: "240.00",
  type: "produit",
  ...over,
});

// Prépare un repo factures avec le client 100 enregistré au tenant A.
function setup(): { repo: FakeFactureRepository; reader: FakeDevisReader } {
  const repo = new FakeFactureRepository();
  repo.registerClient(A.artisanId, 100);
  const reader = new FakeDevisReader();
  return { repo, reader };
}

describe("factures — conversion devis→facture", () => {
  it("convertit un devis accepté en facture (lignes copiées, totaux, devisId lié, statut brouillon)", async () => {
    const { repo, reader } = setup();
    reader.register(devisAccepte(), [ligne()]);
    const f = await convertirDevisEnFacture(repo, reader, A, 7);
    expect(f.typeDocument).toBe("facture");
    expect(f.statut).toBe("brouillon");
    expect(f.numero).toBeNull();
    expect(f.devisId).toBe(7);
    expect(f.clientId).toBe(100);
    expect(f.referenceClient).toBe("CMD-42"); // report référence client
    expect(f.totalTTC).toBe("240.00");
    expect((await repo.listLignes(A, f.id)).length).toBe(1);
  });

  it("devis envoyé (envoye) → converti en facture (régression OPE-927)", async () => {
    const { repo, reader } = setup();
    reader.register(devisAccepte({ statut: "envoye" }), [ligne()]);
    const f = await convertirDevisEnFacture(repo, reader, A, 7);
    expect(f.statut).toBe("brouillon");
    expect(f.devisId).toBe(7);
  });

  it("devis non convertible (brouillon/refuse/expire) → Conflict", async () => {
    for (const statut of ["brouillon", "refuse", "expire"] as const) {
      const { repo, reader } = setup();
      reader.register(devisAccepte({ statut }), [ligne()]);
      await expect(convertirDevisEnFacture(repo, reader, A, 7)).rejects.toBeInstanceOf(ConflictError);
    }
  });

  it("devis d'un autre tenant → NotFound (anti-IDOR-FK)", async () => {
    const { repo, reader } = setup();
    reader.register(devisAccepte({ artisanId: 2 }), [ligne()]); // devis appartient à B
    await expectCrossTenantDenied(() => convertirDevisEnFacture(repo, reader, A, 7));
    await expect(convertirDevisEnFacture(repo, reader, A, 7)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("idempotence : brouillon existant → retourné sans créer de doublon (OPE-960)", async () => {
    const { repo, reader } = setup();
    reader.register(devisAccepte(), [ligne()]);
    const f1 = await convertirDevisEnFacture(repo, reader, A, 7);
    const f2 = await convertirDevisEnFacture(repo, reader, A, 7);
    expect(f2.id).toBe(f1.id);
  });

  it("anti-doublon : facture déjà émise (non brouillon) → Conflict", async () => {
    const { repo, reader } = setup();
    reader.register(devisAccepte(), [ligne()]);
    const f1 = await convertirDevisEnFacture(repo, reader, A, 7);
    repo.setStatutForTest(f1.id, "envoyee");
    await expect(convertirDevisEnFacture(repo, reader, A, 7)).rejects.toBeInstanceOf(ConflictError);
  });

  it("section/note du devis reportées (montants neutres) — totaux dérivés des lignes", async () => {
    const { repo, reader } = setup();
    reader.register(devisAccepte(), [
      ligne(),
      ligne({ ordre: 1, designation: "— Lot —", type: "section", quantite: "0", prixUnitaireHT: "0", montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" }),
    ]);
    const f = await convertirDevisEnFacture(repo, reader, A, 7);
    expect(f.totalTTC).toBe("240.00"); // la section n'ajoute rien
    expect((await repo.listLignes(A, f.id)).length).toBe(2);
  });
});
