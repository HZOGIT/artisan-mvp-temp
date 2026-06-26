import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `devis-detail` (éditeur de devis : statut, lignes, variantes, signature, email,
 * rappels CRM, PDF). Types dérivés du routeur, catalogues + agrégats/mappings PURS testables. 0 React/tRPC.
 */

export type Devis = NonNullable<RouterOutputs["devis"]["getById"]>;
export type Ligne = Devis["lignes"][number];
export type Variante = RouterOutputs["devisOptions"]["getByDevisId"][number];
export type Activite = RouterOutputs["activites"]["list"][number];
export type Signature = RouterOutputs["signature"]["getSignatureByDevis"];
export type Artisan = RouterOutputs["artisan"]["getProfile"];
export type Parametres = RouterOutputs["parametres"]["get"];
export type RappelType = RouterInputs["activites"]["create"]["type"];

export const STATUS_LABEL_KEY: Record<string, string> = {
  brouillon: "statutBrouillon", envoye: "statutEnvoye", accepte: "statutAccepte", refuse: "statutRefuse", expire: "statutExpire",
};
export const STATUS_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700", envoye: "bg-blue-100 text-blue-700", accepte: "bg-green-100 text-green-700",
  refuse: "bg-red-100 text-red-700", expire: "bg-orange-100 text-orange-700",
};
export const RAPPEL_TYPE_KEY: Record<string, string> = {
  appel: "rappelAppel", email: "rappelEmail", rdv: "rappelRdv", relance: "rappelRelance", autre: "rappelAutre",
};

export function formatCurrency(amount: string | number | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount || 0;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number.isFinite(num) ? num : 0);
}

/** Rappels CRM rattachés à CE devis, triés par échéance. PUR. */
export function activitesForDevis(activites: readonly Activite[], devisId: number): Activite[] {
  return activites
    .filter((a) => a.entiteType === "devis" && a.entiteId === devisId)
    .slice()
    .sort((a, b) => new Date(a.echeance).getTime() - new Date(b.echeance).getTime());
}

/** Nombre de rappels non faits. PUR. */
export function pendingCount(activites: readonly Activite[]): number {
  return activites.filter((a) => !a.fait).length;
}

export type PdfLigne = { designation: string; description: string | null; quantite: number; unite: string | null; prixUnitaire: number; tauxTva: number; type: string | null; tvaCategorieId?: string | null; remise: number };

/** Mappe les lignes du devis pour le générateur PDF. PUR. */
export function pdfLignes(lignes: readonly Ligne[]): PdfLigne[] {
  return lignes.map((l) => ({
    designation: l.designation, description: l.description, quantite: parseFloat(String(l.quantite)) || 1,
    unite: l.unite, prixUnitaire: parseFloat(String(l.prixUnitaireHT)) || 0, tauxTva: parseFloat(String(l.tauxTVA)) || 20, type: l.type, tvaCategorieId: (l as { tvaCategorieId?: string | null }).tvaCategorieId ?? null,
    remise: parseFloat(String((l as { remise?: string | null }).remise ?? "0")) || 0,
  }));
}

/** Mutation de transition de statut cible (ou null si non disponible). PUR. */
export function statutTransition(target: string): "envoyer" | "accepter" | "refuser" | null {
  if (target === "envoye") return "envoyer";
  if (target === "accepte") return "accepter";
  if (target === "refuse") return "refuser";
  return null;
}
