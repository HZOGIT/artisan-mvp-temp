import type { TenantContext } from "../../../shared/tenant";
import type { ReadToolHandler } from "./assistant-tool-registry";

/*
 * Handlers de LECTURE de l'assistant agentique (Phase 1b-ii) : clients + factures. Chaque handler
 * appelle un reader DÉJÀ MIGRÉ (scopé tenant/RLS) et formate le `data` à la **forme legacy**
 * (`server/_core/assistantTools.ts`) — le modèle a été calibré sur ces formes. Les fonctions de
 * formatage sont PURES (testables sans I/O).
 */

/** Sous-ensemble des champs client/facture nécessaires (compatible avec les types migrés Client/Facture). */
export interface AgentClient {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  /** ex-`entreprise` legacy */
  readonly raisonSociale: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly ville: string | null;
}
export interface AgentFacture {
  readonly id: number;
  readonly numero: string;
  readonly clientId: number;
  readonly statut: string;
  readonly totalTTC: string;
  readonly dateFacture: Date;
  readonly dateEcheance: Date | null;
}
export interface AgentDevis {
  readonly id: number;
  readonly numero: string;
  readonly clientId: number;
  readonly objet: string | null;
  readonly statut: string;
  readonly totalTTC: string;
  readonly dateDevis: Date;
}
export interface AgentStock {
  readonly id: number;
  readonly designation: string;
  /** ex-`quantite` legacy */
  readonly quantiteEnStock: string;
  /** ex-`seuil` legacy */
  readonly seuilAlerte: string;
  readonly unite: string;
}
export interface AgentFournisseur {
  readonly id: number;
  readonly nom: string;
  readonly contact: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly ville: string | null;
}
export interface AgentIntervention {
  readonly id: number;
  readonly titre: string;
  readonly clientId: number;
  readonly dateDebut: Date;
  readonly dateFin: Date | null;
  readonly statut: string;
  readonly adresse: string | null;
}
/** Stats dashboard nécessaires à `get_statistiques` (DashboardStats migré est structurellement compatible). */
export interface AgentDashboardStats {
  readonly caMonth: number;
  readonly caYear: number;
  readonly totalClients: number;
  readonly devisEnCours: number;
  readonly facturesImpayees: { readonly count: number; readonly total: number };
}

export interface ClientsReaderForAgent {
  list(ctx: TenantContext): Promise<readonly AgentClient[]>;
}
export interface FacturesReaderForAgent {
  list(ctx: TenantContext): Promise<readonly AgentFacture[]>;
}
export interface DevisReaderForAgent {
  list(ctx: TenantContext): Promise<readonly AgentDevis[]>;
}
export interface StocksReaderForAgent {
  list(ctx: TenantContext): Promise<readonly AgentStock[]>;
}
export interface FournisseursReaderForAgent {
  list(ctx: TenantContext): Promise<readonly AgentFournisseur[]>;
}
export interface InterventionsReaderForAgent {
  list(ctx: TenantContext): Promise<readonly AgentIntervention[]>;
}
export interface StatsReaderForAgent {
  getStats(ctx: TenantContext): Promise<AgentDashboardStats>;
}

/*
 * `clients`/`factures` requis (lectures de base) ; les autres sont optionnels (câblés au fil de l'eau —
 * le registry n'expose au modèle que les outils dont le reader est fourni). `get_statistiques` exige
 * `stats` + `interventions` + `stocks` (il les compose).
 */
export interface AssistantReadDeps {
  readonly clients: ClientsReaderForAgent;
  readonly factures: FacturesReaderForAgent;
  readonly devis?: DevisReaderForAgent;
  readonly stocks?: StocksReaderForAgent;
  readonly fournisseurs?: FournisseursReaderForAgent;
  readonly interventions?: InterventionsReaderForAgent;
  readonly stats?: StatsReaderForAgent;
}

/** Normalisation recherche : minuscule, sans accents (NFD + suppression des diacritiques combinants). */
export function normalizeForSearch(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const clientCard = (c: AgentClient) => ({
  id: c.id,
  nom: c.nom,
  prenom: c.prenom,
  entreprise: c.raisonSociale || null,
  email: c.email || null,
  telephone: c.telephone || null,
  ville: c.ville || null,
});

/*
 * `chercher_client` : recherche multi-mots tolérante (parité legacy) — passe 1 chaîne complète, passe 2
 * tous les mots (ordre libre), passe 3 partielle scorée ; ≤5 résultats. Renvoie `{matches, count}`.
 */
export function formatChercherClient(clients: readonly AgentClient[], rawNom: string): { matches: ReturnType<typeof clientCard>[]; count: number } {
  const queryNorm = normalizeForSearch(rawNom);
  const words = queryNorm.split(/\s+/).filter((w) => w.length > 0);
  const haystackOf = (c: AgentClient) => normalizeForSearch(`${c.prenom || ""} ${c.nom || ""} ${c.raisonSociale || ""} ${c.email || ""}`);

  type Candidate = { c: AgentClient; score: number };
  /** Passe 1 — la chaîne complète apparaît telle quelle. */
  let candidates: Candidate[] = clients.filter((c) => haystackOf(c).includes(queryNorm)).map((c) => ({ c, score: 1000 }));
  /** Passe 2 — tous les mots présents (ordre/champ libres). */
  if (candidates.length === 0) {
    candidates = clients.filter((c) => words.every((w) => haystackOf(c).includes(w))).map((c) => ({ c, score: words.length * 10 }));
  }
  /** Passe 3 — partielle : au moins un mot, tri par nombre de mots matchés décroissant. */
  if (candidates.length === 0) {
    candidates = clients
      .map((c) => ({ c, score: words.reduce((acc, w) => acc + (haystackOf(c).includes(w) ? 1 : 0), 0) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
  }
  const matches = candidates.slice(0, 5).map(({ c }) => clientCard(c));
  return { matches, count: matches.length };
}

/** `lister_clients` : filtre substring sur nom/prénom/entreprise, ≤50 résultats. `{count, total, clients}`. */
export function formatListerClients(clients: readonly AgentClient[], rawFiltre: string | undefined): { count: number; total: number; clients: ReturnType<typeof clientCard>[] } {
  const filtre = String(rawFiltre || "").toLowerCase().trim();
  const filtered = filtre
    ? clients.filter((c) => {
        const full = `${c.prenom || ""} ${c.nom || ""}`.toLowerCase();
        return full.includes(filtre) || (c.raisonSociale || "").toLowerCase().includes(filtre);
      })
    : clients;
  const limited = filtered.slice(0, 50).map((c) => clientCard(c));
  return { count: limited.length, total: filtered.length, clients: limited };
}

/** Map clientId → "Prénom Nom" (sinon "#id") pour enrichir les listes de factures. */
export function buildClientNameMap(clients: readonly AgentClient[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const c of clients) map.set(c.id, `${c.prenom || ""} ${c.nom || ""}`.trim() || `#${c.id}`);
  return map;
}

/*
 * `lister_factures` : toutes les factures (filtre statut optionnel), nom client résolu, plus récente
 * d'abord. `{count, factures}`.
 */
export function formatListerFactures(factures: readonly AgentFacture[], names: Map<number, string>, statut: string | undefined): { count: number; factures: object[] } {
  const wantStatut = statut ? String(statut).trim() : undefined;
  let list = factures.map((f) => ({
    id: f.id,
    numero: f.numero,
    client: names.get(f.clientId) || `#${f.clientId}`,
    statut: f.statut,
    totalTTC: f.totalTTC,
    dateFacture: f.dateFacture,
    dateEcheance: f.dateEcheance,
  }));
  if (wantStatut) list = list.filter((f) => f.statut === wantStatut);
  list.sort((a, b) => new Date(b.dateFacture).getTime() - new Date(a.dateFacture).getTime());
  return { count: list.length, factures: list };
}

/** `lister_factures_impayees` : statut ≠ payee/annulee/brouillon, jours de retard, plus en retard d'abord. */
export function formatListerFacturesImpayees(factures: readonly AgentFacture[], now: number): { count: number; factures: object[] } {
  const impayees = factures
    .filter((f) => f.statut !== "payee" && f.statut !== "annulee" && f.statut !== "brouillon")
    .map((f) => ({
      id: f.id,
      numero: f.numero,
      clientId: f.clientId,
      totalTTC: f.totalTTC,
      statut: f.statut,
      dateEcheance: f.dateEcheance,
      joursRetard: f.dateEcheance ? Math.max(0, Math.floor((now - new Date(f.dateEcheance).getTime()) / 86400000)) : 0,
    }))
    .sort((a, b) => b.joursRetard - a.joursRetard);
  return { count: impayees.length, factures: impayees };
}

/** `lister_devis` : tous les devis (filtre statut optionnel), nom client résolu, plus récent d'abord. */
export function formatListerDevis(devis: readonly AgentDevis[], names: Map<number, string>, statut: string | undefined): { count: number; devis: object[] } {
  const wantStatut = statut ? String(statut).trim() : undefined;
  let list = devis.map((d) => ({
    id: d.id,
    numero: d.numero,
    client: names.get(d.clientId) || `#${d.clientId}`,
    objet: d.objet,
    statut: d.statut,
    totalTTC: d.totalTTC,
    dateDevis: d.dateDevis,
  }));
  if (wantStatut) list = list.filter((d) => d.statut === wantStatut);
  list.sort((a, b) => new Date(b.dateDevis).getTime() - new Date(a.dateDevis).getTime());
  return { count: list.length, devis: list };
}

/** `lister_devis_en_attente` : devis `envoye`, jours depuis envoi, plus ancien (le plus en attente) d'abord. */
export function formatListerDevisEnAttente(devis: readonly AgentDevis[], now: number): { count: number; devis: object[] } {
  const enAttente = devis
    .filter((d) => d.statut === "envoye")
    .map((d) => ({
      id: d.id,
      numero: d.numero,
      clientId: d.clientId,
      objet: d.objet,
      totalTTC: d.totalTTC,
      dateDevis: d.dateDevis,
      joursDepuisEnvoi: d.dateDevis ? Math.floor((now - new Date(d.dateDevis).getTime()) / 86400000) : 0,
    }))
    .sort((a, b) => b.joursDepuisEnvoi - a.joursDepuisEnvoi);
  return { count: enAttente.length, devis: enAttente };
}

/** `verifier_stocks` : statut rupture (q≤0) | alerte (q≤seuil) | ok, + récap réappro (parité legacy). */
export function formatVerifierStocks(stocks: readonly AgentStock[]): {
  total: number;
  nbRuptures: number;
  nbAlertes: number;
  aReapprovisionner: object[];
  tousLesArticles: object[];
} {
  const items = stocks.map((s) => {
    const quantite = Number(s.quantiteEnStock ?? 0);
    const seuil = Number(s.seuilAlerte ?? 0);
    let statut: "rupture" | "alerte" | "ok" = "ok";
    if (quantite <= 0) statut = "rupture";
    else if (seuil > 0 && quantite <= seuil) statut = "alerte";
    return { id: s.id, designation: s.designation || `Article #${s.id}`, quantite, seuil, unite: s.unite || "u", statut };
  });
  const ruptures = items.filter((i) => i.statut === "rupture");
  const alertes = items.filter((i) => i.statut === "alerte");
  return {
    total: items.length,
    nbRuptures: ruptures.length,
    nbAlertes: alertes.length,
    aReapprovisionner: [...ruptures, ...alertes].slice(0, 30),
    tousLesArticles: items.slice(0, 50),
  };
}

/** `lister_fournisseurs` : ≤50, `{count, fournisseurs}` (avec `contact`). */
export function formatListerFournisseurs(fournisseurs: readonly AgentFournisseur[]): { count: number; fournisseurs: object[] } {
  const limited = fournisseurs.slice(0, 50).map((f) => ({
    id: f.id,
    nom: f.nom,
    email: f.email || null,
    telephone: f.telephone || null,
    ville: f.ville || null,
    contact: f.contact || null,
  }));
  return { count: limited.length, fournisseurs: limited };
}

/** `chercher_fournisseur` : substring nom (insensible casse), ≤5, `{matches, count}` (sans `contact`). */
export function formatChercherFournisseur(fournisseurs: readonly AgentFournisseur[], rawNom: string): { matches: object[]; count: number } {
  const query = String(rawNom || "").toLowerCase().trim();
  const matches = fournisseurs
    .filter((f) => (f.nom || "").toLowerCase().includes(query))
    .slice(0, 5)
    .map((f) => ({ id: f.id, nom: f.nom, email: f.email || null, telephone: f.telephone || null, ville: f.ville || null }));
  return { matches, count: matches.length };
}

/** `lister_interventions` : filtres statut + dateDebut≥dateMin / dateDebut≤dateMax, ≤50, `{count, interventions}`. */
export function formatListerInterventions(
  interventions: readonly AgentIntervention[],
  filtres: { statut?: string; dateDebut?: string; dateFin?: string },
): { count: number; interventions: object[] } {
  const dateMin = filtres.dateDebut ? new Date(filtres.dateDebut) : null;
  const dateMax = filtres.dateFin ? new Date(filtres.dateFin) : null;
  const filtered = interventions
    .filter((i) => {
      if (filtres.statut && i.statut !== filtres.statut) return false;
      const d = new Date(i.dateDebut);
      if (dateMin && d < dateMin) return false;
      if (dateMax && d > dateMax) return false;
      return true;
    })
    .slice(0, 50)
    .map((i) => ({ id: i.id, titre: i.titre, clientId: i.clientId, dateDebut: i.dateDebut, dateFin: i.dateFin, statut: i.statut, adresse: i.adresse || null }));
  return { count: filtered.length, interventions: filtered };
}

/** Nombre d'interventions planifiées dans les 7 prochains jours (pour `get_statistiques`). */
export function countInterventionsSemaine(interventions: readonly AgentIntervention[], now: number): number {
  const week = now + 7 * 86400000;
  return interventions.filter((i) => {
    const d = new Date(i.dateDebut).getTime();
    return d >= now && d <= week && i.statut === "planifiee";
  }).length;
}

/*
 * `get_statistiques` : compose dashboard (CA/clients/devis/impayées) + interventions à venir 7 j +
 * compteurs de stock (alerte/rupture, même classification que `verifier_stocks`).
 */
export function formatGetStatistiques(
  stats: AgentDashboardStats,
  interventionsSemaine: number,
  stocksAlerte: number,
  stocksRupture: number,
  periode: string | undefined,
): object {
  return {
    periode: periode || "mois+annee",
    caMois: Number(stats.caMonth || 0).toFixed(2),
    caAnnee: Number(stats.caYear || 0).toFixed(2),
    totalClients: stats.totalClients,
    devisEnCours: stats.devisEnCours,
    facturesImpayeesNb: stats.facturesImpayees.count,
    facturesImpayeesTotal: Number(stats.facturesImpayees.total || 0).toFixed(2),
    interventionsSemaine,
    stocksAlerte,
    stocksRupture,
  };
}

/*
 * Construit les handlers de lecture mappés aux readers migrés (scopés tenant). Les domaines optionnels
 * ne sont câblés que si leur reader est fourni (sinon l'outil reste indisponible côté registry).
 */
export function buildAssistantReadHandlers(deps: AssistantReadDeps): Record<string, ReadToolHandler> {
  const handlers: Record<string, ReadToolHandler> = {
    chercher_client: async (args, ctx: TenantContext) => {
      const raw = String(args?.nom || "").trim();
      if (!raw) return { ok: false, error: "Le paramètre 'nom' est requis" };
      const clients = await deps.clients.list(ctx);
      return { ok: true, data: formatChercherClient(clients, raw) };
    },
    lister_clients: async (args, ctx: TenantContext) => {
      const clients = await deps.clients.list(ctx);
      return { ok: true, data: formatListerClients(clients, args?.filtre as string | undefined) };
    },
    lister_factures: async (args, ctx: TenantContext) => {
      const [factures, clients] = await Promise.all([deps.factures.list(ctx), deps.clients.list(ctx)]);
      return { ok: true, data: formatListerFactures(factures, buildClientNameMap(clients), args?.statut as string | undefined) };
    },
    lister_factures_impayees: async (_args, ctx: TenantContext) => {
      const factures = await deps.factures.list(ctx);
      return { ok: true, data: formatListerFacturesImpayees(factures, Date.now()) };
    },
  };

  const devisReader = deps.devis;
  if (devisReader) {
    handlers.lister_devis = async (args, ctx: TenantContext) => {
      const [devis, clients] = await Promise.all([devisReader.list(ctx), deps.clients.list(ctx)]);
      return { ok: true, data: formatListerDevis(devis, buildClientNameMap(clients), args?.statut as string | undefined) };
    };
    handlers.lister_devis_en_attente = async (_args, ctx: TenantContext) => {
      const devis = await devisReader.list(ctx);
      return { ok: true, data: formatListerDevisEnAttente(devis, Date.now()) };
    };
  }

  const stocksReader = deps.stocks;
  if (stocksReader) {
    handlers.verifier_stocks = async (_args, ctx: TenantContext) => {
      const stocks = await stocksReader.list(ctx);
      return { ok: true, data: formatVerifierStocks(stocks) };
    };
  }

  const fournisseursReader = deps.fournisseurs;
  if (fournisseursReader) {
    handlers.lister_fournisseurs = async (_args, ctx: TenantContext) => {
      const fournisseurs = await fournisseursReader.list(ctx);
      return { ok: true, data: formatListerFournisseurs(fournisseurs) };
    };
    handlers.chercher_fournisseur = async (args, ctx: TenantContext) => {
      const raw = String(args?.nom || "").trim();
      if (!raw) return { ok: false, error: "Le paramètre 'nom' est requis" };
      const fournisseurs = await fournisseursReader.list(ctx);
      return { ok: true, data: formatChercherFournisseur(fournisseurs, raw) };
    };
  }

  const interventionsReader = deps.interventions;
  if (interventionsReader) {
    handlers.lister_interventions = async (args, ctx: TenantContext) => {
      const interventions = await interventionsReader.list(ctx);
      return {
        ok: true,
        data: formatListerInterventions(interventions, {
          statut: args?.statut as string | undefined,
          dateDebut: args?.dateDebut as string | undefined,
          dateFin: args?.dateFin as string | undefined,
        }),
      };
    };
  }

  /** `get_statistiques` compose 3 readers → câblé seulement si les 3 sont fournis. */
  const statsReader = deps.stats;
  if (statsReader && interventionsReader && stocksReader) {
    handlers.get_statistiques = async (args, ctx: TenantContext) => {
      const [stats, interventions, stocks] = await Promise.all([statsReader.getStats(ctx), interventionsReader.list(ctx), stocksReader.list(ctx)]);
      const stk = formatVerifierStocks(stocks);
      return {
        ok: true,
        data: formatGetStatistiques(stats, countInterventionsSemaine(interventions, Date.now()), stk.nbAlertes, stk.nbRuptures, args?.periode as string | undefined),
      };
    };
  }

  return handlers;
}
