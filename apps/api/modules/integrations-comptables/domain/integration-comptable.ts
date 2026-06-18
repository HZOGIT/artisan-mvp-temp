// Intégrations comptables : configuration d'export vers un logiciel tiers (Sage/QuickBooks/Ciel/EBP)
// + historique des exports + génération du contenu (FEC réutilisé du domaine comptabilité ; IIF porté).
// ⚠️ Lecture seule des données financières : on n'altère JAMAIS les écritures (parité legacy).

export type LogicielComptable = "sage" | "quickbooks" | "ciel" | "ebp" | "autre";
export type FormatExport = "fec" | "iif" | "qbo" | "csv";
export type FrequenceSync = "quotidien" | "hebdomadaire" | "mensuel" | "manuel";
export type ExportStatut = "en_cours" | "termine" | "erreur";

// Configuration comptable d'un artisan (1 par tenant). Tous les champs nullables (config partielle).
export interface ConfigComptable {
  readonly logiciel: string | null;
  readonly formatExport: string | null;
  readonly compteVentes: string | null;
  readonly compteTVACollectee: string | null;
  readonly compteClients: string | null;
  readonly compteAchats: string | null;
  readonly compteTVADeductible: string | null;
  readonly compteFournisseurs: string | null;
  readonly compteBanque: string | null;
  readonly compteCaisse: string | null;
  readonly journalVentes: string | null;
  readonly journalAchats: string | null;
  readonly journalBanque: string | null;
  readonly prefixeFacture: string | null;
  readonly prefixeAvoir: string | null;
  readonly exerciceDebut: number | null;
  readonly actif: boolean | null;
  readonly syncAutoFactures: boolean | null;
  readonly syncAutoPaiements: boolean | null;
  readonly frequenceSync: string | null;
  readonly heureSync: string | null;
  readonly notifierErreurs: boolean | null;
  readonly notifierSucces: boolean | null;
  readonly derniereSync: Date | null;
  readonly prochainSync: Date | null;
}

// Patch d'upsert de la config (toutes optionnelles ; artisanId jamais fourni par le client).
export interface SaveConfigInput {
  readonly logiciel?: LogicielComptable;
  readonly formatExport?: FormatExport;
  readonly compteVentes?: string;
  readonly compteTVACollectee?: string;
  readonly compteClients?: string;
  readonly compteAchats?: string;
  readonly compteTVADeductible?: string;
  readonly compteFournisseurs?: string;
  readonly compteBanque?: string;
  readonly compteCaisse?: string;
  readonly journalVentes?: string;
  readonly journalAchats?: string;
  readonly journalBanque?: string;
  readonly prefixeFacture?: string;
  readonly prefixeAvoir?: string;
  readonly exerciceDebut?: number;
  readonly actif?: boolean;
}

export interface SaveSyncConfigInput {
  readonly syncAutoFactures?: boolean;
  readonly syncAutoPaiements?: boolean;
  readonly frequenceSync?: FrequenceSync;
  readonly heureSync?: string;
  readonly notifierErreurs?: boolean;
  readonly notifierSucces?: boolean;
}

export interface ExportComptableRow {
  readonly id: number;
  readonly logiciel: string | null;
  readonly formatExport: string | null;
  readonly periodeDebut: string | null;
  readonly periodeFin: string | null;
  readonly nombreEcritures: number | null;
  readonly montantTotal: string | null;
  readonly statut: string | null;
  readonly erreur: string | null;
  readonly createdAt: Date;
}

// Facture pour l'export IIF (sous-ensemble).
export interface FactureIIF {
  readonly id: number;
  readonly numero: string | null;
  readonly dateFacture: Date;
  readonly totalHT: string | null;
  readonly totalTVA: string | null;
  readonly totalTTC: string | null;
  readonly clientNom: string | null;
  readonly clientPrenom: string | null;
}

// Génère l'export IIF (Intuit Interchange Format pour QuickBooks). PUR, parité legacy `genererExportIIF` :
// sections !TRNS/!SPL/!ENDTRNS, 1 transaction INVOICE par facture (TTC au débit Accounts Receivable,
// HT + TVA au crédit, signes négatifs côté SPL).
export function buildIIF(factures: readonly FactureIIF[]): string {
  const lines: string[] = [];
  lines.push("!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO");
  lines.push("!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO");
  lines.push("!ENDTRNS");
  for (const f of factures) {
    const dateF = new Date(f.dateFacture).toLocaleDateString("en-US");
    const client = `${f.clientPrenom || ""} ${f.clientNom || ""}`.trim() || `Client #${f.id}`;
    const ttc = Number(f.totalTTC).toFixed(2);
    const ht = (-Number(f.totalHT)).toFixed(2);
    const tva = (-Number(f.totalTVA)).toFixed(2);
    lines.push(`TRNS\t\tINVOICE\t${dateF}\tAccounts Receivable\t${client}\t${ttc}\t${f.numero || ""}\tFacture ${f.numero}`);
    lines.push(`SPL\t\tINVOICE\t${dateF}\tSales\t${client}\t${ht}\tHT`);
    lines.push(`SPL\t\tINVOICE\t${dateF}\tSales Tax Payable\t${client}\t${tva}\tTVA`);
    lines.push("ENDTRNS");
  }
  return lines.join("\n");
}

// Statut de synchro dérivé de la config (parité legacy `getSyncStatus`).
export function deriveSyncStatus(config: ConfigComptable | null): { actif: boolean; derniereSync: Date | null; prochainSync: Date | null } {
  return {
    actif: Boolean(config?.syncAutoFactures || config?.syncAutoPaiements),
    derniereSync: config?.derniereSync ?? null,
    prochainSync: config?.prochainSync ?? null,
  };
}
