import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAINE de la feature `clients` (clean-archi) : types dérivés des sorties du routeur tRPC
// (source de vérité serveur — zod → AppRouter) + règles PURES testables sans réseau ni i18n.
// La couche application/ui dépend de ces types/fonctions, pas du transport.

export type Client = RouterOutputs["clients"]["list"][number];
export type EncoursMap = RouterOutputs["clients"]["getEncoursMap"];

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
