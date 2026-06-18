import { describe, it, expect } from "vitest";
import { FakeFactureRepository } from "../infra/facture-repository-fake";
import { getFactureDetail, getAvoirsFacture, getAuditLogFacture } from "./read-use-cases";
import { NotFoundError } from "../../../shared/errors";
import type { ClientReader, ClientInfo } from "./contact-readers";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };
const CLIENT: ClientInfo = { id: 100, nom: "Durand", prenom: "Marie", email: "marie@cli.fr" };
const clientReader = (c: ClientInfo | null): ClientReader => ({ getClient: async () => c });

const avoirLigne = { designation: "Remboursement", description: null, quantite: "1", unite: "u", prixUnitaireHT: "-100.00", tauxTVA: "20", montantHT: "-100.00", montantTVA: "-20.00", montantTTC: "-120.00" };

async function seedFacture(repo: FakeFactureRepository, ctx: TenantContext) {
  const f = await repo.create(ctx, { clientId: CLIENT.id, numero: "FAC-00001", objet: "Réparation" });
  await repo.addLigne(ctx, f.id, { designation: "MO", prixUnitaireHT: "100.00", quantite: "1" });
  return f;
}

// L1 — use-cases de lecture « détail » des factures (rétro-complétion d'un module activé) :
// getFactureDetail (agrégation + 404 + client null), getAvoirsFacture / getAuditLogFacture (gardes
// behavior-preserving : [] si hors tenant, PAS 404). Repo + reader injectés (fakes).
describe("factures — read detail use-cases", () => {
  describe("getFactureDetail", () => {
    it("agrège {...facture, lignes, client} pour une facture du tenant", async () => {
      const repo = new FakeFactureRepository();
      const f = await seedFacture(repo, A);
      const detail = await getFactureDetail(repo, clientReader(CLIENT), A, f.id);
      expect(detail.id).toBe(f.id);
      expect(detail.numero).toBe("FAC-00001");
      expect(detail.lignes).toHaveLength(1);
      expect(detail.client).toEqual(CLIENT);
    });

    it("client supprimé (reader → null) → detail.client = null", async () => {
      const repo = new FakeFactureRepository();
      const f = await seedFacture(repo, A);
      const detail = await getFactureDetail(repo, clientReader(null), A, f.id);
      expect(detail.client).toBeNull();
      expect(detail.lignes).toHaveLength(1);
    });

    it("facture inexistante / hors tenant → NotFound (anti-IDOR)", async () => {
      const repo = new FakeFactureRepository();
      const f = await seedFacture(repo, A);
      await expect(getFactureDetail(repo, clientReader(CLIENT), A, 999)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getFactureDetail(repo, clientReader(CLIENT), B, f.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("getAvoirsFacture (behavior-preserving : [] si hors tenant, pas 404)", () => {
    it("facture présente → liste ses avoirs ; autre tenant → [] (pas d'exception)", async () => {
      const repo = new FakeFactureRepository();
      const f = await seedFacture(repo, A);
      await repo.createAvoir(A, { factureOrigineId: f.id, clientId: CLIENT.id, numero: "AV-00001", objet: "Avoir", notes: null, conditionsPaiement: null, lignes: [avoirLigne] });
      const avoirs = await getAvoirsFacture(repo, A, f.id);
      expect(avoirs).toHaveLength(1);
      expect(avoirs[0].typeDocument).toBe("avoir");
      expect(await getAvoirsFacture(repo, B, f.id)).toEqual([]); // hors tenant → [] (pas NotFound)
    });

    it("facture inexistante → [] (jamais 404)", async () => {
      const repo = new FakeFactureRepository();
      expect(await getAvoirsFacture(repo, A, 999)).toEqual([]);
    });
  });

  describe("getAuditLogFacture (behavior-preserving : [] si hors tenant, pas 404)", () => {
    it("facture présente → journal trié (desc) ; autre tenant → []", async () => {
      const repo = new FakeFactureRepository();
      const f = await seedFacture(repo, A);
      repo.seedAuditLog(A.artisanId, f.id, "creation");
      repo.seedAuditLog(A.artisanId, f.id, "envoi");
      const log = await getAuditLogFacture(repo, A, f.id);
      expect(log.length).toBeGreaterThanOrEqual(2);
      expect(await getAuditLogFacture(repo, B, f.id)).toEqual([]); // hors tenant → []
    });

    it("facture inexistante → [] (jamais 404)", async () => {
      const repo = new FakeFactureRepository();
      expect(await getAuditLogFacture(repo, A, 999)).toEqual([]);
    });
  });
});
