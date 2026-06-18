// Types d'ENTRÉE des générateurs PDF (internalisés depuis le legacy `server/_core/pdfGenerator.ts`).
// Le générateur jsPDF est repris VERBATIM (déjà correct au runtime avec les objets domaine migrés
// passés via `PdfPort.render`). Ces types ne servent qu'à documenter la SURFACE consommée — les champs
// sont volontairement larges (`any`) : le générateur coerce tout (`Number(...)`, `new Date(...)`,
// formatage) et l'adapter (`js-pdf-adapter.ts`) caste l'entrée. La sécurité de type utile est portée en
// amont par les domaines migrés (Devis/Facture/Commande/Client/…), pas ici.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DevisLigne {
  designation?: any;
  quantite?: any;
  unite?: any;
  prixUnitaireHT?: any;
  prixUnitaire?: any;
  tauxTVA?: any;
}

export interface FactureLigne extends DevisLigne {
  montantHT?: any;
  montantTVA?: any;
  type?: any;
}
export type LigneCommandeFournisseur = DevisLigne;

export interface Devis {
  numero?: any;
  dateDevis?: any;
  dateValidite?: any;
  referenceClient?: any;
  totalHT?: any;
  totalTVA?: any;
  totalTTC?: any;
}

export interface Facture {
  numero?: any;
  dateFacture?: any;
  dateEcheance?: any;
  referenceClient?: any;
  statut?: any;
  // Lus par le générateur Factur-X (CII) :
  totalHT?: any;
  totalTVA?: any;
  totalTTC?: any;
}

export interface Artisan {
  nomEntreprise?: any;
  adresse?: any;
  codePostal?: any;
  ville?: any;
  email?: any;
  telephone?: any;
  siret?: any;
  tauxTVA?: any;
  numeroTVA?: any; // Factur-X (CII)
  conditionsGenerales?: any;
}

export interface Client {
  nom?: any;
  prenom?: any;
  email?: any;
  telephone?: any;
  adresse?: any;
  codePostal?: any;
  ville?: any;
}

export interface ContratMaintenance {
  titre?: any;
  type?: any;
  reference?: any;
  description?: any;
  dateDebut?: any;
  dateFin?: any;
  periodicite?: any;
  montantHT?: any;
  tauxTVA?: any;
  reconduction?: any;
  preavisResiliation?: any;
  conditionsParticulieres?: any;
}

export interface CommandeFournisseur {
  numero?: any;
  dateCommande?: any;
  reference?: any;
  delaiLivraison?: any;
  adresseLivraison?: any;
  notes?: any;
  totalHT?: any;
  totalTVA?: any;
  totalTTC?: any;
}

export interface Fournisseur {
  nom?: any;
  contact?: any;
  email?: any;
  telephone?: any;
  adresse?: any;
  codePostal?: any;
  ville?: any;
}
