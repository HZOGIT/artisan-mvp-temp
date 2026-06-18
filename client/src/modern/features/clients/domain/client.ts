import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAINE de la feature `clients` (clean-archi) : types dérivés des sorties du routeur tRPC
// (source de vérité serveur — zod → AppRouter) + règles PURES testables sans réseau ni i18n.
// La couche application/ui dépend de ces types/fonctions, pas du transport.

export type Client = RouterOutputs["clients"]["list"][number];
export type EncoursMap = RouterOutputs["clients"]["getEncoursMap"];

// Types de la vue DÉTAIL (`/clients/:id`) — dérivés des sorties serveur (0 `any`).
export type ClientDetail = NonNullable<RouterOutputs["clients"]["getById"]>;
export type DevisRow = RouterOutputs["devis"]["list"][number];
export type FactureRow = RouterOutputs["factures"]["list"][number];
export type InterventionRow = RouterOutputs["interventions"]["list"][number];
export type ActiviteRow = RouterOutputs["activites"]["list"][number];
export type PortalStatus = RouterOutputs["clientPortal"]["getStatus"];
export type ActiviteType = NonNullable<RouterInputs["activites"]["create"]["type"]>;

const toNumber = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

// Filtre PUR : lignes rattachées à un client (devis/factures/interventions ont toutes `clientId`).
export function ofClient<T extends { clientId: number | null }>(
  rows: readonly T[],
  clientId: number,
): T[] {
  return rows.filter((r) => r.clientId === clientId);
}

// Activités/rappels CRM rattachés à CE client (entité polymorphe → filtrer type + id).
export function activitesOfClient(rows: readonly ActiviteRow[], clientId: number): ActiviteRow[] {
  return rows.filter((a) => a.entiteType === "client" && a.entiteId === clientId);
}

// Tri PUR par échéance croissante (copie, ne mute pas l'entrée).
export function sortActivitesByEcheance(rows: readonly ActiviteRow[]): ActiviteRow[] {
  return rows.slice().sort((a, b) => new Date(a.echeance).getTime() - new Date(b.echeance).getTime());
}

export interface ClientStats {
  totalFacture: number;
  facturesImpayees: number;
  devisEnAttente: number;
  interventionsTerminees: number;
}

// Statistiques PURES affichées en tête de la fiche client (mêmes règles que le legacy).
export function computeClientStats(
  devis: readonly DevisRow[],
  factures: readonly FactureRow[],
  interventions: readonly InterventionRow[],
): ClientStats {
  const totalFacture = factures
    .filter((f) => f.statut === "payee")
    .reduce((s, f) => s + toNumber(f.totalTTC), 0);
  const facturesImpayees = factures
    .filter((f) => f.statut !== "payee" && f.statut !== "annulee")
    .reduce((s, f) => s + toNumber(f.totalTTC), 0);
  const devisEnAttente = devis.filter((d) => d.statut === "envoye").length;
  const interventionsTerminees = interventions.filter((i) => i.statut === "terminee").length;
  return { totalFacture, facturesImpayees, devisEnAttente, interventionsTerminees };
}

// Libellé d'affichage d'un client.
export function nomComplet(c: Pick<Client, "nom" | "prenom" | "raisonSociale">): string {
  if (c.raisonSociale) return c.raisonSociale;
  return [c.prenom, c.nom].filter(Boolean).join(" ").trim() || c.nom;
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const digits = (s: unknown) => String(s ?? "").replace(/[\s.\-()+]/g, "");

// Descripteur i18n d'un groupe de doublons (la couche UI formate via `t(reasonKey, reasonParams)`).
export type DupeReasonKey = "dupesSameEmail" | "dupesSameName";
export interface DuplicateGroup {
  reasonKey: DupeReasonKey;
  reasonParams?: { email: string };
  clients: Client[];
}

// Détection PURE de doublons potentiels (même email OU même prénom+nom, normalisés). Informatif.
export function findDuplicateGroups(clients: readonly Client[]): DuplicateGroup[] {
  const push = (m: Map<string, Client[]>, k: string, c: Client) => {
    const a = m.get(k);
    if (a) a.push(c); else m.set(k, [c]);
  };
  const byEmail = new Map<string, Client[]>();
  const byName = new Map<string, Client[]>();
  for (const c of clients) {
    const email = norm(c.email);
    if (email) push(byEmail, email, c);
    const name = `${norm(c.prenom)} ${norm(c.nom)}`.trim();
    if (name) push(byName, name, c);
  }
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();
  const addGroup = (g: DuplicateGroup) => {
    if (g.clients.length < 2) return;
    const key = g.clients.map((c) => c.id).sort((a, b) => a - b).join(",");
    if (seen.has(key)) return;
    seen.add(key);
    groups.push(g);
  };
  for (const [email, list] of byEmail) addGroup({ reasonKey: "dupesSameEmail", reasonParams: { email }, clients: list });
  for (const [, list] of byName) addGroup({ reasonKey: "dupesSameName", clients: list });
  return groups;
}

export type CreateDupeReasonKey = "dupeReasonEmail" | "dupeReasonPhone" | "dupeReasonName";
export interface CreateDuplicateMatch {
  client: Client;
  reasonKey: CreateDupeReasonKey;
}

// Avertissement PUR (non bloquant) à la création : l'email/téléphone/nom saisi correspond-il à un
// client existant ? Renvoie la clé i18n de la raison (formatée côté UI).
export function findCreateDuplicateMatch(
  form: { email: string; telephone: string; prenom: string; nom: string },
  clients: readonly Client[],
): CreateDuplicateMatch | null {
  const email = norm(form.email);
  const phone = digits(form.telephone);
  const name = `${norm(form.prenom)} ${norm(form.nom)}`.trim();
  for (const c of clients) {
    if (email && norm(c.email) === email) return { client: c, reasonKey: "dupeReasonEmail" };
    if (phone && phone.length >= 6 && digits(c.telephone) === phone) return { client: c, reasonKey: "dupeReasonPhone" };
  }
  if (name) {
    for (const c of clients) {
      if (`${norm(c.prenom)} ${norm(c.nom)}`.trim() === name) return { client: c, reasonKey: "dupeReasonName" };
    }
  }
  return null;
}
