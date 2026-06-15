import type { TenantContext } from "../../../shared/tenant";
import type { ReadToolHandler } from "./assistant-tool-registry";

// Handlers de LECTURE de l'assistant agentique (Phase 1b-ii) : clients + factures. Chaque handler
// appelle un reader DÉJÀ MIGRÉ (scopé tenant/RLS) et formate le `data` à la **forme legacy**
// (`server/_core/assistantTools.ts`) — le modèle a été calibré sur ces formes. Les fonctions de
// formatage sont PURES (testables sans I/O).

// Sous-ensemble des champs client/facture nécessaires (compatible avec les types migrés Client/Facture).
export interface AgentClient {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly raisonSociale: string | null; // ex-`entreprise` legacy
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

export interface ClientsReaderForAgent {
  list(ctx: TenantContext): Promise<readonly AgentClient[]>;
}
export interface FacturesReaderForAgent {
  list(ctx: TenantContext): Promise<readonly AgentFacture[]>;
}

export interface AssistantReadDeps {
  readonly clients: ClientsReaderForAgent;
  readonly factures: FacturesReaderForAgent;
}

// Normalisation recherche : minuscule, sans accents (NFD + suppression des diacritiques combinants).
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

// `chercher_client` : recherche multi-mots tolérante (parité legacy) — passe 1 chaîne complète, passe 2
// tous les mots (ordre libre), passe 3 partielle scorée ; ≤5 résultats. Renvoie `{matches, count}`.
export function formatChercherClient(clients: readonly AgentClient[], rawNom: string): { matches: ReturnType<typeof clientCard>[]; count: number } {
  const queryNorm = normalizeForSearch(rawNom);
  const words = queryNorm.split(/\s+/).filter((w) => w.length > 0);
  const haystackOf = (c: AgentClient) => normalizeForSearch(`${c.prenom || ""} ${c.nom || ""} ${c.raisonSociale || ""} ${c.email || ""}`);

  type Candidate = { c: AgentClient; score: number };
  // Passe 1 — la chaîne complète apparaît telle quelle.
  let candidates: Candidate[] = clients.filter((c) => haystackOf(c).includes(queryNorm)).map((c) => ({ c, score: 1000 }));
  // Passe 2 — tous les mots présents (ordre/champ libres).
  if (candidates.length === 0) {
    candidates = clients.filter((c) => words.every((w) => haystackOf(c).includes(w))).map((c) => ({ c, score: words.length * 10 }));
  }
  // Passe 3 — partielle : au moins un mot, tri par nombre de mots matchés décroissant.
  if (candidates.length === 0) {
    candidates = clients
      .map((c) => ({ c, score: words.reduce((acc, w) => acc + (haystackOf(c).includes(w) ? 1 : 0), 0) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
  }
  const matches = candidates.slice(0, 5).map(({ c }) => clientCard(c));
  return { matches, count: matches.length };
}

// `lister_clients` : filtre substring sur nom/prénom/entreprise, ≤50 résultats. `{count, total, clients}`.
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

// Map clientId → "Prénom Nom" (sinon "#id") pour enrichir les listes de factures.
export function buildClientNameMap(clients: readonly AgentClient[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const c of clients) map.set(c.id, `${c.prenom || ""} ${c.nom || ""}`.trim() || `#${c.id}`);
  return map;
}

// `lister_factures` : toutes les factures (filtre statut optionnel), nom client résolu, plus récente
// d'abord. `{count, factures}`.
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

// `lister_factures_impayees` : statut ≠ payee/annulee/brouillon, jours de retard, plus en retard d'abord.
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

// Construit les handlers de lecture clients + factures, mappés aux readers migrés (scopés tenant).
export function buildAssistantReadHandlers(deps: AssistantReadDeps): Record<string, ReadToolHandler> {
  return {
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
}
