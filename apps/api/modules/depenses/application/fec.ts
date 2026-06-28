import type { TenantContext } from "../../../shared/tenant";
import type { FecReader } from "./fec-reader";
import type { FecDepense, ConfigComptable } from "../domain/fec";

/** En-tête FEC (18 colonnes AFNOR, séparées par tabulation). Parité legacy `exportDepensesFEC`. */
const FEC_HEADER = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
].join("\t");

/** Montant FEC : 2 décimales, virgule décimale (format FR). */
const fec = (val: string | number | null | undefined): string => (Number(val ?? 0) || 0).toFixed(2).replace(".", ",");

const round2 = (v: number) => Math.round(v * 100) / 100;

/*
 * Génère le contenu FEC achats (PUR). ⚠️ Invariant comptable : chaque dépense produit 3 lignes —
 * Achats (HT, débit) + TVA déductible (TVA, débit) + Fournisseurs (TTC, crédit) — donc, par
 * construction, **débit (HT+TVA) = crédit (TTC)** dès lors que `TTC = HT + TVA`.
 */
export function genererFecAchats(depenses: readonly FecDepense[], config: ConfigComptable): string {
  const lines = [FEC_HEADER];
  let num = 1;
  for (const d of depenses) {
    /** YYYYMMDD */
    const dateF = String(d.dateDepense).slice(0, 10).replace(/-/g, "");
    const lib = `Achat ${d.numero} ${d.fournisseur ?? ""}`.trim();
    const tvaDed = round2(Number(d.montantTva) * Number(d.coeffDeductibilite) / 100);
    const chargeHt = round2(Number(d.montantHt) + Number(d.montantTva) - tvaDed);
    lines.push([config.journalAchats, "Achats", num, dateF, config.compteAchats, "Achats", "", "", d.numero, dateF, lib, fec(chargeHt), "0,00", "", "", "", "", ""].join("\t"));
    lines.push([config.journalAchats, "Achats", num, dateF, config.compteTVADeductible, "TVA deductible", "", "", d.numero, dateF, lib, fec(tvaDed), "0,00", "", "", "", "", ""].join("\t"));
    const compteContrepartie = d.remboursable ? "425000" : config.compteFournisseurs;
    const libContrepartie = d.remboursable ? "Personnel" : "Fournisseurs";
    lines.push([config.journalAchats, "Achats", num, dateF, compteContrepartie, libContrepartie, "", "", d.numero, dateF, lib, "0,00", fec(d.montantTtc), "", "", "", "", ""].join("\t"));
    num++;
  }
  return lines.join("\n");
}

/*
 * Use-case `exportFecAchats` : lit les dépenses déductibles de la période + la config comptable, puis
 * génère le FEC (texte). Lecture seule, scopé tenant.
 */
export async function exportFecAchats(reader: FecReader, ctx: TenantContext, dateDebut: string, dateFin: string): Promise<{ contenu: string }> {
  const [depenses, config] = await Promise.all([reader.listDepensesDeductibles(ctx, dateDebut, dateFin), reader.getConfigComptable(ctx)]);
  return { contenu: genererFecAchats(depenses, config) };
}
