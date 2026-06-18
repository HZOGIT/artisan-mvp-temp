import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `nouvelle-depense` (saisie + scan IA d'un justificatif). Types dérivés du
// routeur, règles pures testables (calcul TTC, prochaine occurrence, mapping OCR→formulaire, payload).
//
// ⚠️ Deux écarts de contrat révélés par le typage (le legacy les masquait par cast non typé, cf. findings) :
//   1. `frequenceRecurrence` du backend = {mensuelle,trimestrielle,annuelle} — PAS d'« hebdomadaire »
//      (le legacy l'offrait → zod 400 silencieux). On s'aligne sur l'enum backend.
//   2. `statut` n'est PAS un champ d'entrée de `depenses.create` (forcé serveur) — le legacy l'envoyait
//      via un cast non typé, donc il était ignoré. Les boutons « Brouillon »/« Soumettre » créent à l'identique.

export type Categorie = RouterOutputs["depenses"]["getCategories"][number];
export type Client = RouterOutputs["clients"]["list"][number];
export type Doublon = RouterOutputs["depenses"]["checkDoublons"][number];
export type AnalyseResult = RouterOutputs["depenses"]["analyserJustificatif"];
export type AnalyseData = NonNullable<AnalyseResult["data"]>;
export type CreateInput = RouterInputs["depenses"]["create"];
export type ModePaiement = NonNullable<CreateInput["modePaiement"]>;
export type Frequence = NonNullable<CreateInput["frequenceRecurrence"]>;

export const FREQUENCES: readonly Frequence[] = ["mensuelle", "trimestrielle", "annuelle"];
export const TAUX_TVA_OPTIONS = [0, 5.5, 10, 20] as const;
export const MODES_PAIEMENT: readonly ModePaiement[] = ["carte", "especes", "virement", "cheque", "prelevement"];

// Mapping catégorie IA (code) → libellé de catégorie utilisateur.
export const CAT_IA_MAP: Record<string, string> = {
  materiaux: "Matériaux & Fournitures", carburant: "Carburant", outillage: "Outillage & Équipement",
  repas: "Repas & Restauration", deplacement: "Déplacement & Transport", telephone: "Téléphone & Internet",
  "sous-traitance": "Sous-traitance", assurance: "Assurances", loyer: "Loyer & Charges",
  formation: "Formation & Documentation", bancaire: "Frais bancaires", autre: "Autres frais",
};

export type DepenseForm = {
  dateDepense: string; fournisseur: string; categorie: string; sousCategorie: string; description: string;
  montantHt: string; tauxTva: string; modePaiement: ModePaiement; remboursable: boolean; tvaDeductible: boolean;
  notes: string; chantierId: number | undefined; clientId: number | undefined;
  recurrente: boolean; frequenceRecurrence: Frequence;
};

export function defaultForm(): DepenseForm {
  return {
    dateDepense: new Date().toISOString().slice(0, 10), fournisseur: "", categorie: "", sousCategorie: "",
    description: "", montantHt: "", tauxTva: "20", modePaiement: "carte", remboursable: true,
    tvaDeductible: true, notes: "", chantierId: undefined, clientId: undefined, recurrente: false, frequenceRecurrence: "mensuelle",
  };
}

// Calcul des montants (HT/TVA/TTC) à partir des saisies. PUR.
export function montants(montantHtStr: string, tauxTvaStr: string): { ht: number; tva: number; ttc: number } {
  const ht = parseFloat(montantHtStr || "0");
  const taux = parseFloat(tauxTvaStr || "0");
  const tva = +((ht * taux) / 100).toFixed(2);
  return { ht, tva, ttc: +(ht + tva).toFixed(2) };
}

// Date de prochaine occurrence selon la fréquence (par défaut +1 mois). PUR.
export function prochaineOccurrence(dateDepense: string, recurrente: boolean, frequence: Frequence): string {
  if (!recurrente || !dateDepense) return "";
  const d = new Date(dateDepense);
  if (frequence === "trimestrielle") d.setMonth(d.getMonth() + 3);
  else if (frequence === "annuelle") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

const asStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const asNumStr = (v: unknown): string | undefined => (typeof v === "number" || (typeof v === "string" && v !== "") ? String(v) : undefined);

// Applique le résultat OCR au formulaire : champs remplis + ensemble des clés « pré-remplies IA ». PUR.
export function applyOcr(form: DepenseForm, data: AnalyseData): { form: DepenseForm; iaFields: Set<string> } {
  const next = { ...form };
  const ia = new Set<string>();
  const fournisseur = asStr(data.fournisseur);
  const date = asStr(data.date);
  const montantHT = asNumStr(data.montantHT);
  const tauxTVA = asNumStr(data.tauxTVA);
  const description = asStr(data.description);
  const categorie = asStr(data.categorie);
  if (fournisseur) { next.fournisseur = fournisseur; ia.add("fournisseur"); }
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { next.dateDepense = date; ia.add("dateDepense"); }
  if (montantHT !== undefined) { next.montantHt = montantHT; ia.add("montantHt"); }
  if (tauxTVA !== undefined) { next.tauxTva = tauxTVA; ia.add("tauxTva"); }
  if (description) { next.description = description; ia.add("description"); }
  if (categorie) {
    const mapped = CAT_IA_MAP[categorie.toLowerCase()] || "";
    if (mapped) { next.categorie = mapped; ia.add("categorie"); }
  }
  return { form: next, iaFields: ia };
}

export type PayloadExtras = { photoDataUrl: string; photoNom: string | undefined };

// Construit le payload de création depuis le formulaire (montants en chaînes décimales, cf. zod). PUR.
export function buildPayload(form: DepenseForm, extras: PayloadExtras): CreateInput {
  const occ = prochaineOccurrence(form.dateDepense, form.recurrente, form.frequenceRecurrence);
  return {
    dateDepense: form.dateDepense, fournisseur: form.fournisseur || undefined, categorie: form.categorie,
    sousCategorie: form.sousCategorie || undefined, description: form.description || undefined,
    montantHt: form.montantHt, tauxTva: form.tauxTva || undefined,
    modePaiement: form.modePaiement, remboursable: form.remboursable, tvaDeductible: form.tvaDeductible,
    notes: form.notes || undefined, chantierId: form.chantierId, clientId: form.clientId,
    justificatifUrl: extras.photoDataUrl || undefined, justificatifNom: extras.photoNom,
    recurrente: form.recurrente, frequenceRecurrence: form.recurrente ? form.frequenceRecurrence : undefined,
    prochaineOccurrence: form.recurrente ? occ : undefined,
  };
}
