import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `analyses-photos` (diagnostic IA de photos → devis). Types dérivés du routeur,
// agrégats + assainissement d'erreur PURS et testables. 0 React/tRPC.

export type Analyse = RouterOutputs["devisIA"]["list"][number];
export type AnalyseDetail = NonNullable<RouterOutputs["devisIA"]["getById"]>;
export type Resultat = AnalyseDetail["resultats"][number];
export type Suggestion = Resultat["suggestions"][number];
export type Client = RouterOutputs["clients"]["list"][number];
export type Intervention = RouterOutputs["interventions"]["list"][number];

export const MAX_SIZE = 5 * 1024 * 1024; // 5 MB / fichier (transport JSON tRPC).
export const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// Montant € entier, tolérant string/null. PUR.
export function eur(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return (Number.isFinite(v) ? v : 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

// Classe de la pastille d'urgence. PUR.
export function urgenceColor(u: string | null): string {
  if (u === "critique") return "bg-rose-100 text-rose-800 border-rose-300";
  if (u === "haute") return "bg-orange-100 text-orange-800 border-orange-300";
  if (u === "moyenne") return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

// Montant d'une suggestion (quantité × prix estimé). PUR.
export function suggestionMontant(s: Suggestion): number {
  return Number(s.quantiteSuggeree || 0) * Number(s.prixEstime || 0);
}

// Total estimé HT = somme des suggestions sélectionnées de tous les résultats. PUR.
export function totalEstime(resultats: readonly Resultat[]): number {
  return resultats.reduce((sum, r) => sum + (r.suggestions || []).reduce((s2, s) => (s.selectionne ? s2 + suggestionMontant(s) : s2), 0), 0);
}

// Fichier accepté ? (type MIME OU extension). PUR.
export function isAccepted(name: string, type: string): boolean {
  return ACCEPTED.includes(type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(name);
}

// Defense en profondeur : ne JAMAIS afficher un toast contenant un payload base64 brut. Strip les data:
// URL + tout long base64 isolé, tronque à 240 car. PUR.
export function safeErrorMsg(e: unknown, fallback = "Erreur"): string {
  const base = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  let msg = String(base || fallback);
  msg = msg.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
  msg = msg.replace(/[A-Za-z0-9+/=]{200,}/g, "[…]");
  if (msg.length > 240) msg = msg.slice(0, 240) + "…";
  return msg;
}
