import { describe, it, expect } from "vitest";
import { listerDevisAcceptes } from "./devis-acceptes-use-cases";
import { FakeDevisRepository } from "../../devis/infra/devis-repository-fake";
import { FakeClientRepository } from "../../clients/infra/client-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 4410001;

const byNumero = (rows: Awaited<ReturnType<typeof listerDevisAcceptes>>, numero: string) => rows.find((r) => r.numero === numero)!;

describe("listerDevisAcceptes (use-case cross-domaine devis × clients, fakes)", () => {
  it("ne retourne QUE les devis acceptés (brouillon/envoyé exclus)", async () => {
    const devisRepo = new FakeDevisRepository();
    const clientRepo = new FakeClientRepository();
    const c = await clientRepo.create(ctx(A), { nom: "Durand" });
    const accepte = await devisRepo.create(ctx(A), { clientId: c.id, numero: "DEV-OK" });
    devisRepo.setStatutForTest(accepte.id, "accepte");
    await devisRepo.create(ctx(A), { clientId: c.id, numero: "DEV-BR" }); // reste brouillon

    const rows = await listerDevisAcceptes(devisRepo, clientRepo, ctx(A));
    expect(rows.map((r) => r.numero)).toEqual(["DEV-OK"]);
  });

  it("enrichit le nom client : « nom prénom » si prénom, sinon « nom » seul", async () => {
    const devisRepo = new FakeDevisRepository();
    const clientRepo = new FakeClientRepository();
    const c1 = await clientRepo.create(ctx(A), { nom: "Durand", prenom: "Marie" });
    const c2 = await clientRepo.create(ctx(A), { nom: "Martin" });
    const d1 = await devisRepo.create(ctx(A), { clientId: c1.id, numero: "DEV-1" });
    const d2 = await devisRepo.create(ctx(A), { clientId: c2.id, numero: "DEV-2" });
    devisRepo.setStatutForTest(d1.id, "accepte");
    devisRepo.setStatutForTest(d2.id, "accepte");

    const rows = await listerDevisAcceptes(devisRepo, clientRepo, ctx(A));
    expect(byNumero(rows, "DEV-1").clientNom).toBe("Durand Marie");
    expect(byNumero(rows, "DEV-2").clientNom).toBe("Martin");
  });

  it("client introuvable / hors tenant → clientNom = « Client » (best-effort)", async () => {
    const devisRepo = new FakeDevisRepository();
    const clientRepo = new FakeClientRepository();
    const orphelin = await devisRepo.create(ctx(A), { clientId: 999999, numero: "DEV-ORPH" });
    devisRepo.setStatutForTest(orphelin.id, "accepte");

    const rows = await listerDevisAcceptes(devisRepo, clientRepo, ctx(A));
    expect(byNumero(rows, "DEV-ORPH").clientNom).toBe("Client");
  });

  it("mapping : objet null → \"\", totalTTC en number, dateDevis en ISO", async () => {
    const devisRepo = new FakeDevisRepository();
    const clientRepo = new FakeClientRepository();
    const c = await clientRepo.create(ctx(A), { nom: "Durand" });
    // avec objet + lignes (total 240) + date fixée
    const avecObjet = await devisRepo.create(ctx(A), { clientId: c.id, numero: "DEV-FULL", objet: "Réno cuisine" });
    await devisRepo.addLigne(ctx(A), avecObjet.id, { designation: "Pose", quantite: "2", prixUnitaireHT: "100.00", tauxTVA: "20" });
    devisRepo.setStatutForTest(avecObjet.id, "accepte");
    devisRepo.setDateDevisForTest(avecObjet.id, new Date("2026-03-01T00:00:00.000Z"));
    // sans objet ni lignes
    const vide = await devisRepo.create(ctx(A), { clientId: c.id, numero: "DEV-MIN" });
    devisRepo.setStatutForTest(vide.id, "accepte");

    const rows = await listerDevisAcceptes(devisRepo, clientRepo, ctx(A));
    const full = byNumero(rows, "DEV-FULL");
    expect(full.objet).toBe("Réno cuisine");
    expect(full.totalTTC).toBe(240);
    expect(typeof full.totalTTC).toBe("number");
    expect(full.dateDevis).toBe("2026-03-01T00:00:00.000Z");
    const min = byNumero(rows, "DEV-MIN");
    expect(min.objet).toBe("");
    expect(min.totalTTC).toBe(0);
  });
});
