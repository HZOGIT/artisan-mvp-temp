import { describe, it, expect } from "vitest";
import { isTerminal } from "../../../../drizzle/schema/einvoicing";
import { isValidSiret } from "../../../../packages/contract/validation";
import type { AppContext } from "../../interface/trpc/context";
import type { TenantContext } from "../../shared/tenant";
import type { DbClient } from "../../shared/db";
import { FakePaAdapter } from "./infra/fake-pa-adapter";
import { ensureArtisanEntity } from "./application/ensure-artisan-entity";
import { createEinvoicingRouter } from "./interface/trpc/einvoicing.router";
import { pollInbound } from "../../shared/infra/pa-inbound-poller";
import { mapToPayload } from "./application/facture-mapper";
import type { Facture, FactureLigne, Artisan, Client } from "../../../../drizzle/schema.pg";

const fakeLog = { child: () => fakeLog, info: () => {}, warn: () => {}, error: () => {} } as unknown as AppContext["log"];
const tenant = (artisanId = 1): TenantContext => ({ artisanId, userId: 99 });
const ctx = (artisanId = 1): AppContext => ({
  claims: { userId: 99, email: "t@t.fr" },
  tenant: tenant(artisanId),
  role: null,
  permissions: [],
  res: null,
  clientIp: "unknown",
  userAgent: "unknown",
  log: fakeLog,
});

function makeSelectChain(rows: unknown[]) {
  const chain = { from: () => chain, where: () => chain, limit: () => Promise.resolve(rows) };
  return chain;
}

function makeFakeTx(selectRows: unknown[] = [], onInsert?: () => void) {
  const chain = makeSelectChain(selectRows);
  return {
    execute: () => Promise.resolve({ rows: [] }),
    select: () => chain,
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => { onInsert?.(); return Promise.resolve(); },
      }),
    }),
  };
}

describe("isTerminal", () => {
  it("refusee et rejetee sont terminaux", () => {
    expect(isTerminal("refusee")).toBe(true);
    expect(isTerminal("rejetee")).toBe(true);
  });

  it("autres statuts ne sont pas terminaux", () => {
    expect(isTerminal("non_soumise")).toBe(false);
    expect(isTerminal("deposee")).toBe(false);
    expect(isTerminal("approuvee")).toBe(false);
    expect(isTerminal("encaissee")).toBe(false);
  });
});

describe("isValidSiret", () => {
  it("SIRET Luhn valide retourne true", () => {
    expect(isValidSiret("83814693700027")).toBe(true);
  });
  it("SIRET Luhn invalide retourne false", () => {
    expect(isValidSiret("12345678901234")).toBe(false);
  });
  it("chaîne trop courte retourne false", () => {
    expect(isValidSiret("1234567890")).toBe(false);
  });
});

describe("einvoicing.emettre", () => {
  it("lève PRECONDITION_FAILED si aucune entité PA active en base", async () => {
    const db = {
      transaction: (fn: (tx: unknown) => unknown) => fn(makeFakeTx([])),
    } as unknown as DbClient;
    const r = createEinvoicingRouter(new FakePaAdapter(), db);
    await expect(r.createCaller(ctx()).emettre({ factureId: 1 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("soumet la facture si une entité PA active existe", async () => {
    const db = {
      transaction: (fn: (tx: unknown) => unknown) => fn(makeFakeTx([{ paEntityId: "fake-entity-abc" }])),
    } as unknown as DbClient;
    const r = createEinvoicingRouter(new FakePaAdapter(), db);
    const result = await r.createCaller(ctx()).emettre({ factureId: 42 });
    expect(result.paDocumentId).toBeDefined();
    expect(result.statut).toBe("soumis");
  });
});

describe("ensureArtisanEntity", () => {
  it("lève une erreur si l'artisan n'a pas de SIRET", async () => {
    const db = {
      select: () => makeSelectChain([{ siret: null, nomEntreprise: "Test", email: "t@t.fr" }]),
    } as unknown as DbClient;
    await expect(ensureArtisanEntity(db, new FakePaAdapter(), tenant()))
      .rejects.toThrow("SIRET manquant");
  });

  it("retourne paEntityId et kybStatut via FakePaAdapter et upserte pa_entites", async () => {
    let upserted = false;
    const db = {
      select: () => makeSelectChain([{ siret: "83814693700027", nomEntreprise: "ACME", email: "a@a.fr" }]),
      transaction: (fn: (tx: unknown) => unknown) => fn(makeFakeTx([], () => { upserted = true; })),
    } as unknown as DbClient;
    const result = await ensureArtisanEntity(db, new FakePaAdapter(), tenant());
    expect(result.paEntityId).toBe("fake-entity-83814693700027");
    expect(result.kybStatut).toBe("validé");
    expect(upserted).toBe(true);
  });
});

const baseFacture: Facture = {
  id: 1,
  artisanId: 10,
  clientId: 20,
  devisId: null,
  numero: "FAC-001",
  dateFacture: new Date("2026-01-15"),
  dateEcheance: null,
  statut: "validee",
  typeDocument: "facture",
  factureOrigineId: null,
  objet: null,
  referenceClient: null,
  siretDestinataire: null,
  conditionsPaiement: null,
  notes: null,
  totalHT: "100.00",
  totalTVA: "20.00",
  totalTTC: "120.00",
  montantPaye: "0.00",
  datePaiement: null,
  modePaiement: null,
  createdAt: new Date("2026-01-15"),
  statutCycleVie: "non_soumise",
  paId: null,
  paDocumentId: null,
  paFormat: null,
  updatedAt: new Date("2026-01-15"),
};

const baseArtisan: Artisan = {
  id: 10,
  userId: 1,
  siret: "12345678901234",
  nomEntreprise: "Plomberie Dupont",
  adresse: "1 rue de la Paix",
  codePostal: "75001",
  ville: "Paris",
  telephone: null,
  email: "dupont@example.com",
  specialite: "plomberie",
  tauxTVA: "20.00",
  numeroTVA: "FR12345678901",
  iban: null,
  codeAPE: null,
  formeJuridique: "SARL",
  capitalSocial: null,
  villeRCS: null,
  numeroRM: null,
  logo: null,
  slug: null,
  icalToken: null,
  metier: null,
  plan: "essentiel",
  onboardingCompleted: false,
  franchiseTVA: false,
  assuranceDecennaleNom: null,
  assuranceDecennalePolice: null,
  assuranceDecennaleGarantie: null,
  isActive: true,
  pendingDeletionAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const baseClient: Client = {
  id: 20,
  artisanId: 10,
  nom: "Martin",
  prenom: "Jean",
  email: "jean@example.com",
  telephone: null,
  adresse: "2 avenue Victor Hugo",
  codePostal: "75016",
  ville: "Paris",
  adresseFacturation: null,
  codePostalFacturation: null,
  villeFacturation: null,
  type: "particulier",
  raisonSociale: null,
  siret: null,
  numeroTVA: null,
  etiquettes: null,
  notes: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const ligne20: FactureLigne = {
  id: 1,
  factureId: 1,
  ordre: 0,
  reference: null,
  designation: "Remplacement robinet",
  description: null,
  quantite: "1.00",
  unite: "unité",
  prixUnitaireHT: "100.00",
  tauxTVA: "20.00",
  remise: "0.00",
  montantHT: "100.00",
  montantTVA: "20.00",
  montantTTC: "120.00",
  type: "produit",
  tvaCategorieId: null,
};

describe("mapToPayload", () => {
  it("mono-taux 20% : totaux et tvaBreakdown corrects", () => {
    const payload = mapToPayload(baseFacture, baseArtisan, baseClient, [ligne20]);

    expect(payload.typeDocument).toBe("facture");
    expect(payload.numero).toBe("FAC-001");
    expect(payload.date).toBe("2026-01-15");
    expect(payload.totalHT).toBe("100.00");
    expect(payload.totalTva).toBe("20.00");
    expect(payload.totalTTC).toBe("120.00");
    expect(payload.tvaBreakdown).toHaveLength(1);
    expect(payload.tvaBreakdown[0]).toEqual({
      taux: "20.00",
      baseHT: "100.00",
      montantTva: "20.00",
    });
    expect(payload.emetteur.siret).toBe("12345678901234");
    expect(payload.destinataire.nom).toBe("Jean Martin");
    expect(payload.mentionLegale).toBeUndefined();
  });

  it("multi-taux : tvaBreakdown groupé par taux", () => {
    const ligne10: FactureLigne = {
      ...ligne20,
      id: 2,
      designation: "Fournitures",
      tauxTVA: "10.00",
      montantHT: "50.00",
      montantTVA: "5.00",
      montantTTC: "55.00",
    };
    const payload = mapToPayload(
      { ...baseFacture, totalHT: "150.00", totalTVA: "25.00", totalTTC: "175.00" },
      baseArtisan,
      baseClient,
      [ligne20, ligne10],
    );

    expect(payload.tvaBreakdown).toHaveLength(2);
    const t20 = payload.tvaBreakdown.find((b) => b.taux === "20.00");
    const t10 = payload.tvaBreakdown.find((b) => b.taux === "10.00");
    expect(t20).toEqual({ taux: "20.00", baseHT: "100.00", montantTva: "20.00" });
    expect(t10).toEqual({ taux: "10.00", baseHT: "50.00", montantTva: "5.00" });
  });

  it("avoir : typeDocument = avoir", () => {
    const payload = mapToPayload(
      { ...baseFacture, typeDocument: "avoir", totalHT: "-100.00", totalTVA: "-20.00", totalTTC: "-120.00" },
      baseArtisan,
      baseClient,
      [{ ...ligne20, montantHT: "-100.00", montantTVA: "-20.00", montantTTC: "-120.00" }],
    );

    expect(payload.typeDocument).toBe("avoir");
    expect(payload.totalHT).toBe("-100.00");
    expect(payload.tvaBreakdown[0]?.montantTva).toBe("-20.00");
  });

  it("franchise TVA → mentionLegale présente", () => {
    const payload = mapToPayload(
      baseFacture,
      { ...baseArtisan, franchiseTVA: true },
      baseClient,
      [ligne20],
    );
    expect(payload.mentionLegale).toBe("Auto-entrepreneur non soumis à TVA — art. 293B CGI");
  });

  it("formeJuridique micro → mentionLegale présente", () => {
    const payload = mapToPayload(
      baseFacture,
      { ...baseArtisan, formeJuridique: "micro" },
      baseClient,
      [ligne20],
    );
    expect(payload.mentionLegale).toBe("Auto-entrepreneur non soumis à TVA — art. 293B CGI");
  });
});

describe("pollInbound", () => {
  it("FakePaAdapter retourne [] → 0 insertions, pas d'erreur", async () => {
    const selectChain = { from: () => Promise.resolve([]) };
    const fakeDb = {
      select: () => selectChain,
      transaction: (_fn: (tx: unknown) => unknown) => Promise.resolve(),
    } as unknown as DbClient;
    const result = await pollInbound(new FakePaAdapter(), fakeDb);
    expect(result).toBe(0);
  });
});

describe("facturesEntrantes.lire", () => {
  it("marque lu = true sur une facture non lue", async () => {
    const fakeFe = { id: 7, artisanId: 1, paDocumentId: "doc-1", lu: false, emetteurSiret: "00000000000000", montantTTC: "120.00", date: new Date(), fetchedAt: new Date(), facturxBase64: null };
    let updated = false;
    let callIndex = 0;
    const makeTx = () => ({
      execute: () => Promise.resolve({ rows: [] }),
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([fakeFe]) }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => { updated = true; return Promise.resolve(); },
        }),
      }),
    });
    const fakeDb = {
      transaction: (fn: (tx: unknown) => unknown) => { callIndex++; return fn(makeTx()); },
    } as unknown as DbClient;
    const r = createEinvoicingRouter(new FakePaAdapter(), fakeDb);
    const result = await r.createCaller(ctx()).facturesEntrantes.lire({ id: 7 });
    expect(result.lu).toBe(true);
    expect(updated).toBe(true);
  });
});
