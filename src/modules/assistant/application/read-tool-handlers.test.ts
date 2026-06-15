import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { AssistantReadToolRegistry } from "./assistant-tool-registry";
import {
  buildAssistantReadHandlers,
  formatChercherClient,
  formatListerClients,
  formatListerFactures,
  formatListerFacturesImpayees,
  buildClientNameMap,
  normalizeForSearch,
  formatListerDevis,
  formatListerDevisEnAttente,
  formatVerifierStocks,
  type AgentClient,
  type AgentFacture,
  type AgentDevis,
  type AgentStock,
  type ClientsReaderForAgent,
  type FacturesReaderForAgent,
  type DevisReaderForAgent,
  type StocksReaderForAgent,
} from "./read-tool-handlers";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

const client = (id: number, nom: string, prenom: string | null, raisonSociale: string | null = null, email: string | null = null): AgentClient => ({
  id,
  nom,
  prenom,
  raisonSociale,
  email,
  telephone: null,
  ville: null,
});
const facture = (id: number, clientId: number, statut: string, dateFacture: string, dateEcheance: string | null): AgentFacture => ({
  id,
  numero: `F-${id}`,
  clientId,
  statut,
  totalTTC: "120.00",
  dateFacture: new Date(dateFacture),
  dateEcheance: dateEcheance ? new Date(dateEcheance) : null,
});

const CLIENTS: AgentClient[] = [client(1, "DAD", "Michel", "DAD SARL"), client(2, "Durand", "Sophie"), client(3, "Martin", "Léa", "Boulangerie Martin")];

describe("read-tool-handlers — formatters (purs)", () => {
  it("normalizeForSearch : minuscule + sans accents", () => {
    expect(normalizeForSearch("Léa  ")).toBe("léa".normalize("NFD").replace(/[̀-ͯ]/g, ""));
    expect(normalizeForSearch("Léa")).toBe("lea");
  });

  it("chercher_client : multi-mots ordre libre (« Michel dad » → DAD Michel)", () => {
    const r = formatChercherClient(CLIENTS, "Michel dad");
    expect(r.count).toBe(1);
    expect(r.matches[0]).toMatchObject({ id: 1, nom: "DAD", prenom: "Michel", entreprise: "DAD SARL" });
  });

  it("chercher_client : nom inconnu → 0 résultat ; ≤5 résultats", () => {
    expect(formatChercherClient(CLIENTS, "zzzz").count).toBe(0);
  });

  it("chercher_client : recherche partielle scorée (un seul mot matché)", () => {
    const r = formatChercherClient(CLIENTS, "martin inconnu");
    expect(r.matches[0]?.id).toBe(3); // Martin matché par 1 mot
  });

  it("lister_clients : filtre substring nom/entreprise + total vs count, ≤50", () => {
    const r = formatListerClients(CLIENTS, "boulangerie");
    expect(r).toMatchObject({ count: 1, total: 1 });
    expect(r.clients[0].id).toBe(3);
    const all = formatListerClients(CLIENTS, undefined);
    expect(all.count).toBe(3);
  });

  it("buildClientNameMap : 'Prénom Nom' sinon #id", () => {
    const map = buildClientNameMap([client(1, "DAD", "Michel"), client(2, "", null)]);
    expect(map.get(1)).toBe("Michel DAD");
    expect(map.get(2)).toBe("#2");
  });

  it("lister_factures : nom client résolu, filtre statut, plus récente d'abord", () => {
    const names = buildClientNameMap(CLIENTS);
    const fs = [facture(1, 1, "payee", "2026-01-01", null), facture(2, 2, "envoyee", "2026-03-01", "2026-04-01")];
    const r = formatListerFactures(fs, names, undefined);
    expect(r.count).toBe(2);
    expect((r.factures[0] as { id: number }).id).toBe(2); // 2026-03 avant 2026-01
    expect((r.factures[0] as { client: string }).client).toBe("Sophie Durand");
    const filtered = formatListerFactures(fs, names, "payee");
    expect(filtered.count).toBe(1);
  });

  it("lister_factures_impayees : exclut payee/annulee/brouillon, jours de retard, plus en retard d'abord", () => {
    const now = new Date("2026-06-15").getTime();
    const fs = [
      facture(1, 1, "payee", "2026-01-01", "2026-02-01"),
      facture(2, 2, "envoyee", "2026-03-01", "2026-04-01"), // en retard
      facture(3, 3, "en_retard", "2026-05-01", "2026-06-14"), // 1 j de retard
      facture(4, 1, "brouillon", "2026-06-01", null),
    ];
    const r = formatListerFacturesImpayees(fs, now);
    expect(r.count).toBe(2);
    expect((r.factures[0] as { id: number }).id).toBe(2); // plus de jours de retard d'abord
    expect((r.factures[0] as { joursRetard: number }).joursRetard).toBeGreaterThan((r.factures[1] as { joursRetard: number }).joursRetard);
  });
});

const devis = (id: number, clientId: number, statut: string, dateDevis: string): AgentDevis => ({
  id,
  numero: `D-${id}`,
  clientId,
  objet: "Travaux",
  statut,
  totalTTC: "300.00",
  dateDevis: new Date(dateDevis),
});
const stock = (id: number, designation: string, q: string, seuil: string): AgentStock => ({ id, designation, quantiteEnStock: q, seuilAlerte: seuil, unite: "u" });

describe("read-tool-handlers — devis + stocks (formatters purs)", () => {
  const names = buildClientNameMap(CLIENTS);

  it("lister_devis : nom client résolu, filtre statut, plus récent d'abord", () => {
    const ds = [devis(1, 1, "brouillon", "2026-01-01"), devis(2, 2, "envoye", "2026-03-01")];
    const r = formatListerDevis(ds, names, undefined);
    expect(r.count).toBe(2);
    expect((r.devis[0] as { id: number }).id).toBe(2);
    expect((r.devis[0] as { client: string }).client).toBe("Sophie Durand");
    expect(formatListerDevis(ds, names, "envoye").count).toBe(1);
  });

  it("lister_devis_en_attente : statut=envoye, jours depuis envoi, plus en attente d'abord", () => {
    const now = new Date("2026-06-15").getTime();
    const ds = [devis(1, 1, "accepte", "2026-01-01"), devis(2, 2, "envoye", "2026-06-01"), devis(3, 3, "envoye", "2026-03-01")];
    const r = formatListerDevisEnAttente(ds, now);
    expect(r.count).toBe(2);
    expect((r.devis[0] as { id: number }).id).toBe(3); // envoyé depuis plus longtemps
  });

  it("verifier_stocks : rupture (q≤0) / alerte (q≤seuil) / ok + récap réappro", () => {
    const ss = [stock(1, "Vis", "0", "5"), stock(2, "Tube", "3", "5"), stock(3, "Joint", "50", "5")];
    const r = formatVerifierStocks(ss);
    expect(r).toMatchObject({ total: 3, nbRuptures: 1, nbAlertes: 1 });
    expect(r.aReapprovisionner).toHaveLength(2); // rupture + alerte (ruptures d'abord)
    expect((r.aReapprovisionner[0] as { statut: string }).statut).toBe("rupture");
  });
});

describe("read-tool-handlers — handlers câblés au registry", () => {
  const clientsReader: ClientsReaderForAgent = { list: async () => CLIENTS };
  const facturesReader: FacturesReaderForAgent = { list: async () => [facture(2, 2, "envoyee", "2026-03-01", "2026-04-01")] };
  const devisReader: DevisReaderForAgent = { list: async () => [devis(2, 2, "envoye", "2026-03-01")] };
  const stocksReader: StocksReaderForAgent = { list: async () => [stock(1, "Vis", "0", "5")] };
  const registry = new AssistantReadToolRegistry(
    buildAssistantReadHandlers({ clients: clientsReader, factures: facturesReader, devis: devisReader, stocks: stocksReader }),
  );

  it("expose les 7 lectures (clients/factures/devis/stocks) + naviguer_vers dans tools", () => {
    expect(registry.tools.map((t) => t.name).sort()).toEqual(
      ["chercher_client", "lister_clients", "lister_factures", "lister_factures_impayees", "lister_devis", "lister_devis_en_attente", "verifier_stocks", "naviguer_vers"].sort(),
    );
  });

  it("devis/stocks NON câblés (reader absent) → outils absents de tools", () => {
    const reg = new AssistantReadToolRegistry(buildAssistantReadHandlers({ clients: clientsReader, factures: facturesReader }));
    expect(reg.tools.some((t) => t.name === "lister_devis")).toBe(false);
    expect(reg.tools.some((t) => t.name === "verifier_stocks")).toBe(false);
  });

  it("verifier_stocks → ok + récap", async () => {
    const res = await registry.execute("verifier_stocks", {}, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as { nbRuptures: number }).nbRuptures).toBe(1);
  });

  it("chercher_client sans nom → ok:false", async () => {
    const res = await registry.execute("chercher_client", {}, ctx);
    expect(res.ok).toBe(false);
  });

  it("chercher_client avec nom → ok + data", async () => {
    const res = await registry.execute("chercher_client", { nom: "Durand" }, ctx);
    expect(res).toEqual({ ok: true, data: { matches: [expect.objectContaining({ id: 2 })], count: 1 } });
  });

  it("lister_factures → ok + nom client résolu", async () => {
    const res = await registry.execute("lister_factures", {}, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as { count: number }).count).toBe(1);
  });

  it("écriture toujours refusée même registry câblé (garde-fou Phase 2)", async () => {
    expect((await registry.execute("creer_client", { nom: "X" }, ctx)).ok).toBe(false);
  });
});
