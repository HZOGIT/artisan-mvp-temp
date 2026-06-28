/*
 * Types d'ENTRÉE des générateurs PDF (internalisés depuis le legacy `server/_core/pdfGenerator.ts`).
 * Le générateur jsPDF est repris VERBATIM (déjà correct au runtime avec les objets domaine migrés
 * passés via `PdfPort.render`). Ces types ne servent qu'à documenter la SURFACE consommée — les champs
 * sont volontairement larges : le générateur coerce tout (`Number(...)`, `new Date(...)`,
 * formatage) et l'adapter (`js-pdf-adapter.ts`) caste l'entrée. La sécurité de type utile est portée en
 * amont par les domaines migrés (Devis/Facture/Commande/Client/…), pas ici.
 */


export interface DevisLigne {
  designation?: string | null;
  quantite?: number | string | null;
  unite?: string | null;
  prixUnitaireHT?: number | string | null;
  prixUnitaire?: number | string | null;
  tauxTVA?: number | string | null;
  tvaCategorieId?: string | null;
  remise?: number | string | null;
  montantHT?: number | string | null;
  montantTVA?: number | string | null;
  type?: string | null;
}

export type FactureLigne = DevisLigne;
export type LigneCommandeFournisseur = DevisLigne;

export interface Devis {
  numero?: string | null;
  dateDevis?: string | Date;
  dateValidite?: string | Date | null;
  referenceClient?: string | null;
  totalHT?: number | string | null;
  totalTVA?: number | string | null;
  totalTTC?: number | string | null;
}

export interface Facture {
  numero?: string | null;
  dateFacture?: string | Date;
  dateEcheance?: string | Date | null;
  referenceClient?: string | null;
  statut?: string | null;
  /** Lus par le générateur Factur-X (CII) : */
  totalHT?: number | string | null;
  totalTVA?: number | string | null;
  totalTTC?: number | string | null;
  typeDocument?: string | null;
  objet?: string | null;
  conditionsPaiement?: string | null;
  regimeTVA?: string | null;
}

export interface Artisan {
  nomEntreprise?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  email?: string | null;
  telephone?: string | null;
  siret?: string | null;
  tauxTVA?: number | string | null;
  /** Factur-X (CII) */
  numeroTVA?: string | null;
  conditionsGenerales?: string | null;
  logo?: string | null;
  formeJuridique?: string | null;
  capitalSocial?: number | string | null;
  villeRCS?: string | null;
  numeroRM?: string | null;
  codeAPE?: string | null;
  iban?: string | null;
  assuranceDecennaleNom?: string | null;
  assuranceDecennalePolice?: string | null;
  assuranceDecennaleGarantie?: string | null;
  franchiseTVA?: boolean | null;
}

export interface Client {
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  type?: string | null;
  raisonSociale?: string | null;
  adresseFacturation?: string | null;
  codePostalFacturation?: string | null;
  villeFacturation?: string | null;
  siret?: string | null;
  numeroTVA?: string | null;
}

export interface ContratMaintenance {
  titre?: string | null;
  type?: string | null;
  reference?: string | null;
  description?: string | null;
  dateDebut?: string | Date;
  dateFin?: string | Date | null;
  periodicite?: string | null;
  montantHT?: number | string | null;
  tauxTVA?: number | string | null;
  reconduction?: boolean | string | null;
  preavisResiliation?: number | string | null;
  conditionsParticulieres?: string | null;
}

export interface CommandeFournisseur {
  numero?: string | null;
  dateCommande?: string | Date;
  reference?: string | null;
  delaiLivraison?: string | null;
  adresseLivraison?: string | null;
  notes?: string | null;
  totalHT?: number | string | null;
  totalTVA?: number | string | null;
  totalTTC?: number | string | null;
}

export interface Fournisseur {
  nom?: string | null;
  contact?: string | null;
  email?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
}

export interface AttestationTvaInput {
  /** Numéro du devis ou de la facture concerné */
  documentRef?: string | null;
  dateDocument?: string | Date | null;
  /** Nature des travaux — tirée de l'objet du document */
  objetTravaux?: string | null;
  /** Taux TVA réduit appliqué (10 ou 5.5) */
  tauxTVA?: number | string | null;
  artisan?: Artisan | null;
  client?: Client | null;
}
