import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAINE de la feature `signature` (portail public de signature de devis) (clean-archi) : types
 * dérivés des sorties du routeur tRPC + règles PURES testables sans réseau ni i18n.
 */

export type SignatureData = NonNullable<RouterOutputs["signature"]["getDevisForSignature"]>;
export type SignatureDevis = SignatureData["devis"];
export type SignatureLigne = SignatureData["lignes"][number];
export type SignatureOption = SignatureData["options"][number];

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Le devis a-t-il déjà été traité (accepté ou refusé) ? PUR. */
export function isSignatureProcessed(statut: string | null | undefined): boolean {
  return statut === "accepte" || statut === "refuse";
}

export interface SignatureFormState {
  hasSignature: boolean;
  signataireName: string;
  signataireEmail: string;
  accepted: boolean;
  token: string | undefined;
}

/** Le formulaire de signature est-il complet/valide ? PUR (mêmes conditions que le legacy). */
export function canSubmitSignature(s: SignatureFormState): boolean {
  return s.hasSignature && !!s.signataireName && !!s.signataireEmail && !!s.token && s.accepted;
}

/** Ligne au format attendu par le générateur PDF legacy (montants en number). PUR. */
export interface PdfLigne {
  designation: string;
  description: string | null | undefined;
  quantite: number;
  unite: string | null | undefined;
  prixUnitaire: number;
  tauxTva: number;
}

/** Transformation PURE des lignes de devis → lignes PDF (parse des montants, valeurs par défaut legacy). */
export function buildPdfLignes(lignes: readonly SignatureLigne[]): PdfLigne[] {
  return lignes.map((ligne) => ({
    designation: ligne.designation,
    description: ligne.description,
    quantite: toNum(ligne.quantite) || 1,
    unite: ligne.unite,
    prixUnitaire: toNum(ligne.prixUnitaireHT),
    tauxTva: toNum(ligne.tauxTVA) || 20,
  }));
}
