/*
 * Générateur FEC (Fichier des Écritures Comptables, format réglementaire FR, arrêté 29/07/2013).
 * PORT FIDÈLE du legacy `db.genererFEC`. ⚠️ Fichier OPPOSABLE à l'administration fiscale : le format
 * (18 colonnes AFNOR, TAB, décimale virgule, dates YYYYMMDD) et l'**équilibre Σdébit=Σcrédit** sont
 * des invariants. Aucun montant négatif (les avoirs inversent le sens des comptes en valeur absolue).
 * 100% PUR (aucune I/O) → testable (invariant d'équilibre + parité de format).
 */

export interface FecConfig {
  readonly compteVentes: string;
  readonly compteClients: string;
  readonly compteTVACollectee: string | null;
  readonly compteTVADeductible: string;
  readonly compteFournisseurs: string;
  readonly compteBanque: string;
  readonly journalVentes: string;
  readonly journalAchats: string;
  readonly journalBanque: string;
}

export const DEFAULT_FEC_CONFIG: FecConfig = {
  compteVentes: "706000",
  compteClients: "411000",
  compteTVACollectee: null,
  compteTVADeductible: "445660",
  compteFournisseurs: "401000",
  compteBanque: "512000",
  journalVentes: "VE",
  journalAchats: "AC",
  journalBanque: "BQ",
};

export interface FecFactureLigneTVA {
  readonly tauxTVA: string | number | null;
  /** SUM(montantTVA) du taux (peut être négatif pour un avoir) */
  readonly tva: string | number | null;
}
export interface FecFacture {
  readonly id: number;
  readonly numero: string | null;
  readonly dateFacture: Date | string;
  readonly totalHT: string | number | null;
  readonly totalTVA: string | number | null;
  readonly totalTTC: string | number | null;
  readonly statut: string | null;
  readonly datePaiement: Date | string | null;
  readonly typeDocument: string | null;
  readonly clientId: number;
  readonly clientNom: string | null;
  readonly clientPrenom: string | null;
  readonly lignesTVA: readonly FecFactureLigneTVA[];
}
export interface FecDepenseLine {
  readonly id: number;
  readonly numero: string | null;
  readonly dateDepense: Date | string;
  readonly fournisseur: string | null;
  readonly categorie: string | null;
  readonly montantHT: string | number | null;
  readonly montantTVA: string | number | null;
  readonly montantTTC: string | number | null;
}
export interface FecEncaissement {
  readonly id: number;
  readonly numero: string | null;
  readonly datePaiement: Date | string;
  readonly totalTTC: string | number | null;
  readonly typeDocument: string | null;
  readonly clientId: number;
  readonly clientNom: string | null;
  readonly clientPrenom: string | null;
}
export interface FecInput {
  readonly factures: readonly FecFacture[];
  readonly depenses: readonly FecDepenseLine[];
  readonly encaissements: readonly FecEncaissement[];
}

export interface FecConformite {
  readonly nbEcritures: number;
  readonly nbLignes: number;
  readonly totalDebit: number;
  readonly totalCredit: number;
  readonly ecart: number;
  readonly equilibre: boolean;
  readonly erreurs: string[];
  readonly comptesUtilises: string[];
}
export interface FecResult {
  readonly content: string;
  readonly conformite: FecConformite;
}

/** Compte de TVA collectée selon le taux (parité legacy `compteTvaCollectee`). */
export function compteTvaCollectee(taux: number): { compte: string; lib: string } {
  if (taux >= 19.5) return { compte: "445711", lib: "TVA collectee 20%" };
  if (taux >= 9.5) return { compte: "445712", lib: "TVA collectee 10%" };
  if (taux >= 5) return { compte: "445713", lib: "TVA collectee 5,5%" };
  if (taux >= 2) return { compte: "445714", lib: "TVA collectee 2,1%" };
  return { compte: "445711", lib: "TVA collectee" };
}

/** Compte de charge (classe 6) selon la catégorie de dépense (parité legacy `compteChargeDepense`). */
export function compteChargeDepense(categorie: string | null | undefined): { compte: string; lib: string } {
  const c = (categorie || "").toLowerCase();
  if (/(materiau|fournitur|consommable)/.test(c)) return { compte: "601000", lib: "Achats de matieres premieres" };
  if (/(sous.?trait)/.test(c)) return { compte: "604000", lib: "Sous-traitance" };
  if (/(carburant|essence|gazole|diesel)/.test(c)) return { compte: "606100", lib: "Carburants" };
  if (/(outil)/.test(c)) return { compte: "615000", lib: "Entretien, reparations, outillage" };
  if (/(loyer|location)/.test(c)) return { compte: "613000", lib: "Locations" };
  if (/(assurance)/.test(c)) return { compte: "616000", lib: "Primes d'assurance" };
  if (/(telephone|internet|telecom)/.test(c)) return { compte: "626000", lib: "Frais postaux et telecom" };
  if (/(formation)/.test(c)) return { compte: "623000", lib: "Formation" };
  if (/(bancaire|banque|commission)/.test(c)) return { compte: "627000", lib: "Services bancaires" };
  if (/(repas|restaurant|deplacement|hotel|peage)/.test(c)) return { compte: "625100", lib: "Voyages et deplacements" };
  return { compte: "607000", lib: "Achats" };
}

const SEP = "\t";
const FEC_HEADER = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"];
const clean = (v: unknown): string => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
const amt = (v: unknown): string => (Number(v ?? 0) || 0).toFixed(2).replace(".", ",");
const ymd = (d: Date | string): string => {
  const dt = new Date(d);
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
};
const n = (v: unknown): number => Number(v ?? 0) || 0;

/*
 * Nom de fichier FEC réglementaire (parité legacy) : SIREN (9 chiffres, dérivé du SIRET) + "FEC" +
 * date de clôture (YYYYMMDD) + ".txt". PUR.
 */
export function fecFileName(siret: string | null, dateFin: Date): string {
  const siren = (siret || "000000000").replace(/\D/g, "").slice(0, 9).padEnd(9, "0");
  return `${siren}FEC${ymd(dateFin)}.txt`;
}

/** Construit le FEC complet (3 journaux VE/AC/BQ) + le contrôle de conformité. PUR. */
export function buildFec(input: FecInput, config: FecConfig): FecResult {
  const cVentes = config.compteVentes || "706000";
  const cClients = config.compteClients || "411000";
  const cTvaDed = config.compteTVADeductible || "445660";
  const cFourn = config.compteFournisseurs || "401000";
  const cBanque = config.compteBanque || "512000";
  const jVE = (config.journalVentes || "VE").slice(0, 3);
  const jAC = (config.journalAchats || "AC").slice(0, 3);
  const jBQ = (config.journalBanque || "BQ").slice(0, 3);

  const lines: string[] = [FEC_HEADER.join(SEP)];
  let totalDebit = 0;
  let totalCredit = 0;
  let nbEcritures = 0;
  const comptes = new Set<string>();

  interface Line {
    journal: string; journalLib: string; num: number; date: Date | string;
    compte: string; compteLib: string; auxNum?: string; auxLib?: string;
    piece: string; pieceDate: Date | string; lib: string; debit?: number; credit?: number;
    lettre?: string; dateLet?: Date | string | null; valid: Date | string;
  }
  const push = (f: Line): void => {
    const row = [
      clean(f.journal), clean(f.journalLib), String(f.num), ymd(f.date),
      clean(f.compte), clean(f.compteLib), clean(f.auxNum || ""), clean(f.auxLib || ""),
      clean(f.piece), ymd(f.pieceDate), clean(f.lib),
      amt(f.debit), amt(f.credit), clean(f.lettre || ""), f.dateLet ? ymd(f.dateLet) : "",
      ymd(f.valid), "", "",
    ];
    if (row.length !== 18) throw new Error("FEC: ligne non conforme (18 colonnes attendues)");
    lines.push(row.join(SEP));
    totalDebit += n(f.debit);
    totalCredit += n(f.credit);
    comptes.add(f.compte);
  };

  let num = 0;

  /** ---- 1) JOURNAL DES VENTES (VE) ---- */
  for (const f of input.factures) {
    num++;
    const auxNum = `C${String(f.clientId).padStart(5, "0")}`;
    const auxLib = `${f.clientPrenom || ""} ${f.clientNom || ""}`.trim() || `Client ${f.clientId}`;
    const isAvoir = f.typeDocument === "avoir" || n(f.totalTTC) < 0;
    const piece = f.numero || `F-${f.id}`;
    const lib = `${isAvoir ? "Avoir" : "Facture"} ${piece}`;
    const ht = Math.abs(n(f.totalHT));
    const tva = Math.abs(n(f.totalTVA));
    const ttc = Math.abs(n(f.totalTTC));
    const paid = f.statut === "payee" && f.datePaiement;
    const lettre = paid ? `VL${f.id}` : "";
    push({ journal: jVE, journalLib: "Journal des ventes", num, date: f.dateFacture, compte: cClients, compteLib: "Clients", auxNum, auxLib, piece, pieceDate: f.dateFacture, lib, debit: isAvoir ? 0 : ttc, credit: isAvoir ? ttc : 0, lettre, dateLet: paid ? f.datePaiement : undefined, valid: f.dateFacture });
    push({ journal: jVE, journalLib: "Journal des ventes", num, date: f.dateFacture, compte: cVentes, compteLib: "Ventes de prestations", piece, pieceDate: f.dateFacture, lib, debit: isAvoir ? ht : 0, credit: isAvoir ? 0 : ht, valid: f.dateFacture });
    if (tva > 0) {
      const rows = f.lignesTVA.filter((l) => Math.abs(n(l.tva)) > 0);
      const sommeLignes = rows.reduce((s, l) => s + Math.abs(n(l.tva)), 0);
      if (rows.length > 0 && Math.abs(sommeLignes - tva) < 0.02) {
        for (const l of rows) {
          const t = compteTvaCollectee(n(l.tauxTVA) || 20);
          const mtva = Math.abs(n(l.tva));
          push({ journal: jVE, journalLib: "Journal des ventes", num, date: f.dateFacture, compte: t.compte, compteLib: t.lib, piece, pieceDate: f.dateFacture, lib, debit: isAvoir ? mtva : 0, credit: isAvoir ? 0 : mtva, valid: f.dateFacture });
        }
      } else {
        const t = compteTvaCollectee(20);
        push({ journal: jVE, journalLib: "Journal des ventes", num, date: f.dateFacture, compte: config.compteTVACollectee || t.compte, compteLib: "TVA collectee", piece, pieceDate: f.dateFacture, lib, debit: isAvoir ? tva : 0, credit: isAvoir ? 0 : tva, valid: f.dateFacture });
      }
    }
    nbEcritures++;
  }

  /** ---- 2) JOURNAL DES ACHATS (AC) ---- */
  for (const d of input.depenses) {
    num++;
    const piece = d.numero || `D-${d.id}`;
    const lib = `Achat ${piece}${d.fournisseur ? " - " + d.fournisseur : ""}`;
    const ht = n(d.montantHT);
    const tvaD = n(d.montantTVA);
    const ttc = n(d.montantTTC);
    const charge = compteChargeDepense(d.categorie);
    push({ journal: jAC, journalLib: "Journal des achats", num, date: d.dateDepense, compte: charge.compte, compteLib: charge.lib, piece, pieceDate: d.dateDepense, lib, debit: ht, credit: 0, valid: d.dateDepense });
    if (tvaD > 0) push({ journal: jAC, journalLib: "Journal des achats", num, date: d.dateDepense, compte: cTvaDed, compteLib: "TVA deductible", piece, pieceDate: d.dateDepense, lib, debit: tvaD, credit: 0, valid: d.dateDepense });
    push({ journal: jAC, journalLib: "Journal des achats", num, date: d.dateDepense, compte: cFourn, compteLib: "Fournisseurs", auxNum: d.fournisseur ? `F${String(d.id).padStart(5, "0")}` : "", auxLib: d.fournisseur || "", piece, pieceDate: d.dateDepense, lib, debit: 0, credit: ttc, valid: d.dateDepense });
    nbEcritures++;
  }

  /** ---- 3) JOURNAL DE BANQUE (BQ) ---- */
  for (const p of input.encaissements) {
    num++;
    const auxNum = `C${String(p.clientId).padStart(5, "0")}`;
    const auxLib = `${p.clientPrenom || ""} ${p.clientNom || ""}`.trim() || `Client ${p.clientId}`;
    const piece = p.numero || `F-${p.id}`;
    const isAvoir = p.typeDocument === "avoir" || n(p.totalTTC) < 0;
    const lib = `${isAvoir ? "Remboursement" : "Reglement"} ${piece}`;
    const ttc = Math.abs(n(p.totalTTC));
    const lettre = `VL${p.id}`;
    push({ journal: jBQ, journalLib: "Journal de banque", num, date: p.datePaiement, compte: cBanque, compteLib: "Banque", piece, pieceDate: p.datePaiement, lib, debit: isAvoir ? 0 : ttc, credit: isAvoir ? ttc : 0, valid: p.datePaiement });
    push({ journal: jBQ, journalLib: "Journal de banque", num, date: p.datePaiement, compte: cClients, compteLib: "Clients", auxNum, auxLib, piece, pieceDate: p.datePaiement, lib, debit: isAvoir ? ttc : 0, credit: isAvoir ? 0 : ttc, lettre, dateLet: p.datePaiement, valid: p.datePaiement });
    nbEcritures++;
  }

  /** ---- Contrôles de conformité ---- */
  const erreurs: string[] = [];
  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  const ecart = Math.round((totalDebit - totalCredit) * 100) / 100;
  const equilibre = Math.abs(ecart) < 0.01;
  if (!equilibre) erreurs.push(`Desequilibre debit/credit : ${ecart.toFixed(2)} EUR`);
  for (const cpt of Array.from(comptes)) {
    if (!/^[0-9]{3,}$/.test(cpt)) erreurs.push(`Compte PCG invalide : "${cpt}"`);
  }
  if (lines.length <= 1) erreurs.push("Aucune ecriture sur la periode");

  return {
    content: lines.join("\n"),
    conformite: { nbEcritures, nbLignes: lines.length - 1, totalDebit, totalCredit, ecart, equilibre, erreurs, comptesUtilises: Array.from(comptes).sort() },
  };
}

/** Aperçu FEC : 15 premières lignes projetées + conformité + siret (parité legacy `getFecPreview`). */
export interface FecPreviewLine {
  readonly ecritureNum: string;
  readonly ecritureDate: string;
  readonly compteNum: string;
  readonly compteLib: string;
  readonly pieceRef: string;
  readonly ecritureLib: string;
  readonly debit: string;
  readonly credit: string;
}
export interface FecPreview {
  readonly lines: FecPreviewLine[];
  readonly totalFactures: number;
  readonly siret: string;
  readonly conformite: FecConformite;
}

export function fecPreview(result: FecResult, siret: string | null): FecPreview {
  const rows = result.content.split("\n").filter((r) => r.length > 0);
  const header = (rows[0] || "").split(SEP);
  const col = (name: string): number => header.indexOf(name);
  const lines = rows.slice(1, 16).map((r) => {
    const c = r.split(SEP);
    return {
      ecritureNum: c[col("EcritureNum")] || "",
      ecritureDate: c[col("EcritureDate")] || "",
      compteNum: c[col("CompteNum")] || "",
      compteLib: c[col("CompteLib")] || "",
      pieceRef: c[col("PieceRef")] || "",
      ecritureLib: c[col("EcritureLib")] || "",
      debit: c[col("Debit")] || "0,00",
      credit: c[col("Credit")] || "0,00",
    };
  });
  return { lines, totalFactures: result.conformite.nbEcritures, siret: siret || "", conformite: result.conformite };
}
