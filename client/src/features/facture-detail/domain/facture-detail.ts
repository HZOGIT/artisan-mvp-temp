import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `facture-detail` (éditeur de facture/avoir : statut, paiement, avoirs, lignes,
// audit, rappels CRM, PDF). Types dérivés du routeur + logique de solde d'avoir PURE testable. 0 React/tRPC.

export type Facture = NonNullable<RouterOutputs["factures"]["getById"]>;
export type Ligne = Facture["lignes"][number];
export type Avoir = RouterOutputs["factures"]["getAvoirsByFacture"][number];
export type AuditLog = RouterOutputs["factures"]["getAuditLog"][number];
export type Activite = RouterOutputs["activites"]["list"][number];
export type Artisan = RouterOutputs["artisan"]["getProfile"];
export type Parametres = RouterOutputs["parametres"]["get"];
export type AvoirInput = RouterInputs["factures"]["createAvoir"];
export type AddLigneInput = RouterInputs["factures"]["addLigne"];
export type RappelType = RouterInputs["activites"]["create"]["type"];

// Article du REST public `/api/articles/search` (snake_case).
export type ArticleSearchResult = { id: number; nom: string; description: string | null; prix_base: string; unite: string; categorie: string; tauxTVA?: string | null };
export type AvoirLigneForm = { designation: string; quantite: string; prixUnitaireHT: string; tauxTVA: string; unite: string };

export const STATUS_LABEL_KEY: Record<string, string> = {
  brouillon: "statutBrouillon", validee: "statutValidee", envoyee: "statutEnvoyee", payee: "statutPayee", en_retard: "statutEnRetard", annulee: "statutAnnulee",
};
export const STATUS_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700", validee: "bg-amber-100 text-amber-800", envoyee: "bg-blue-100 text-blue-700",
  payee: "bg-green-100 text-green-700", en_retard: "bg-orange-100 text-orange-700", annulee: "bg-red-100 text-red-700",
};
export const RAPPEL_TYPE_KEY: Record<string, string> = { appel: "rappelAppel", email: "rappelEmail", rdv: "rappelRdv", relance: "rappelRelance", autre: "rappelAutre" };

// Transitions de statut autorisées par la machine à états. PUR.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  brouillon: ["envoyee"], validee: ["envoyee", "payee", "annulee"], envoyee: ["payee", "en_retard"], en_retard: ["payee"], payee: [], annulee: [],
};
export function allowedNext(statut: string): string[] { return ALLOWED_TRANSITIONS[statut] || []; }

const n = (v: unknown): number => parseFloat(String(v ?? "")) || 0;

export function formatCurrency(amount: string | number | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number.isFinite(num) ? num : 0);
}

export function isAvoirDoc(facture: Facture): boolean { return facture.typeDocument === "avoir"; }

export type AvoirSolde = { totalCouvert: number; soldeRestant: number; avoirTotalExistant: Avoir | undefined; bloque: boolean };

// Calcule l'état de couverture d'une facture par ses avoirs. PUR.
export function avoirSolde(avoirs: readonly Avoir[], factureTTC: number): AvoirSolde {
  const totalCouvert = avoirs.reduce((s, a) => s + Math.abs(n(a.totalTTC)), 0);
  const avoirTotalExistant = avoirs.find((a) => Math.abs(Math.abs(n(a.totalTTC)) - factureTTC) < 0.01);
  const soldeRestant = Math.max(0, factureTTC - totalCouvert);
  return { totalCouvert, soldeRestant, avoirTotalExistant, bloque: !!avoirTotalExistant || soldeRestant <= 0.01 };
}

// Montant TTC d'un avoir partiel en cours de saisie. PUR.
export function avoirLignesMontantTTC(lignes: readonly AvoirLigneForm[]): number {
  return lignes.reduce((s, l) => s + Math.abs(n(l.quantite)) * Math.abs(n(l.prixUnitaireHT)) * (1 + n(l.tauxTVA) / 100), 0);
}

// Lignes d'un avoir total (toutes les lignes produit de la facture). PUR.
export function buildAvoirTotalLignes(lignes: readonly Ligne[]): AvoirInput["lignes"] {
  return lignes
    .filter((l) => (l.type ?? "produit") === "produit")
    .map((l) => ({ designation: l.designation, quantite: String(l.quantite ?? "1"), prixUnitaireHT: String(l.prixUnitaireHT ?? "0"), tauxTVA: String(l.tauxTVA ?? "20.00"), unite: l.unite || "unité" }));
}

export type PdfLigne = { designation: string; description: string | null; quantite: number; unite: string | null; prixUnitaire: number; tauxTva: number; type: string | null };
export function pdfLignes(lignes: readonly Ligne[]): PdfLigne[] {
  return lignes.map((l) => ({ designation: l.designation, description: l.description, quantite: n(l.quantite) || 1, unite: l.unite, prixUnitaire: n(l.prixUnitaireHT), tauxTva: n(l.tauxTVA) || 20, type: l.type }));
}

export function activitesForFacture(activites: readonly Activite[], factureId: number): Activite[] {
  return activites.filter((a) => a.entiteType === "facture" && a.entiteId === factureId).slice().sort((a, b) => new Date(a.echeance).getTime() - new Date(b.echeance).getTime());
}
export function pendingCount(activites: readonly Activite[]): number { return activites.filter((a) => !a.fait).length; }

// Action de transition de statut (ou null si « payee » → modale paiement, ou indisponible). PUR.
export function statutAction(target: string): "envoyer" | "marquerEnRetard" | "payer" | null {
  if (target === "envoyee") return "envoyer";
  if (target === "en_retard") return "marquerEnRetard";
  if (target === "payee") return "payer";
  return null;
}
