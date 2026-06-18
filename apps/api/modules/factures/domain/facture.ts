// Types de domaine du module factures (financier CRITIQUE — pièce comptable légale) —
// découplés du schéma Drizzle. ⚠️ Invariants à préserver (étapes ultérieures) :
//  - montants/TVA exacts (decimal/string ; totalTTC = totalHT + totalTVA, **dérivés des lignes**) ;
//  - numérotation maîtrisée serveur (jamais fournie par le client) ;
//  - **immutabilité post-émission** : une facture émise/payée est une pièce légale INALTÉRABLE
//    (bien plus stricte qu'un devis) ;
//  - **FEC débit=crédit** si des écritures comptables sont liées (à vérifier au câblage) ;
//  - isolation cross-tenant, anti-IDOR-FK (clientId/devisId du tenant).
//
// NB : `factures` est en camelCase ; `factures_lignes` n'a PAS d'artisanId → scopées via la
// facture parente du tenant (cf. pattern devis/commandes).

export type FactureStatut = "brouillon" | "validee" | "envoyee" | "payee" | "en_retard" | "annulee";
export type FactureTypeDocument = "facture" | "avoir";
export type LigneType = "produit" | "section" | "note";

export interface FactureLigne {
  readonly id: number;
  readonly factureId: number;
  readonly ordre: number;
  readonly reference: string | null;
  readonly designation: string;
  readonly description: string | null;
  readonly quantite: string;
  readonly unite: string;
  readonly prixUnitaireHT: string;
  readonly tauxTVA: string;
  readonly montantHT: string;
  readonly montantTVA: string;
  readonly montantTTC: string;
  readonly type: LigneType;
}

export interface Facture {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly devisId: number | null;
  readonly numero: string;
  readonly dateFacture: Date;
  readonly dateEcheance: Date | null;
  readonly statut: FactureStatut;
  readonly typeDocument: FactureTypeDocument;
  readonly factureOrigineId: number | null; // facture d'origine d'un avoir
  readonly objet: string | null;
  readonly referenceClient: string | null;
  readonly siretDestinataire: string | null;
  readonly conditionsPaiement: string | null;
  readonly notes: string | null;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
  readonly montantPaye: string;
  readonly datePaiement: Date | null;
  readonly modePaiement: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Entrée de création (niveau repo) : `numero` fourni par le use-case (généré serveur), jamais
// par le client. `statut` (brouillon), totaux (0) et montantPaye (0) = défauts posés par l'infra.
export interface CreateFactureInput {
  readonly clientId: number;
  readonly numero: string;
  readonly devisId?: number | null;
  readonly typeDocument?: FactureTypeDocument;
  readonly factureOrigineId?: number | null;
  readonly objet?: string | null;
  readonly referenceClient?: string | null;
  readonly siretDestinataire?: string | null;
  readonly conditionsPaiement?: string | null;
  readonly notes?: string | null;
  readonly dateEcheance?: Date | null;
}

// Entrée de modification : ⚠️ `clientId`/`devisId`/`numero`/`statut`/`typeDocument`/totaux/
// `montantPaye` ABSENTS — client & pièce immuables, transitions = workflow, totaux dérivés des
// lignes, paiement = use-case dédié.
export interface UpdateFactureInput {
  readonly objet?: string | null;
  readonly referenceClient?: string | null;
  readonly siretDestinataire?: string | null;
  readonly conditionsPaiement?: string | null;
  readonly notes?: string | null;
  readonly dateEcheance?: Date | null;
}

export interface CreateFactureLigneInput {
  readonly designation: string;
  readonly prixUnitaireHT: string;
  readonly quantite?: string;
  readonly unite?: string;
  readonly tauxTVA?: string;
  readonly reference?: string | null;
  readonly description?: string | null;
  readonly ordre?: number;
  readonly type?: LigneType;
}

export interface UpdateFactureLigneInput {
  readonly designation?: string;
  readonly prixUnitaireHT?: string;
  readonly quantite?: string;
  readonly unite?: string;
  readonly tauxTVA?: string;
  readonly reference?: string | null;
  readonly description?: string | null;
  readonly ordre?: number;
  readonly type?: LigneType;
}

// Entrée du journal d'audit d'une facture (lecture seule, parité legacy `getAuditLog`).
// Table `audit_log` (scopée artisanId + entityType/entityId). `details` = JSON/texte libre.
export interface AuditLogEntry {
  readonly id: number;
  readonly userId: number;
  readonly entityType: string;
  readonly entityId: number;
  readonly action: string;
  readonly details: string | null;
  readonly createdAt: Date;
}
