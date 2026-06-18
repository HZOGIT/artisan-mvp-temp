import { ValidationError } from "../../../shared/errors";
import type { ImportTransaction } from "../domain/transaction-bancaire";

// Parse PUR d'un relevé bancaire CSV (parité legacy `importReleve`). Ligne 1 = header ; séparateur
// `;`/`,` auto-détecté. Heuristique colonnes : date(0), libellé(1), montant(2) — sinon colonnes
// débit(2)/crédit(3). Date `DD/MM/YYYY` → `YYYY-MM-DD`. Lignes invalides ignorées.
//  - CSV vide/< 2 lignes → [] (l'appelant renvoie un message).
//  - > 5000 lignes de données → ValidationError (anti-DoS).
export function parseReleveCsv(contenuCsv: string): ImportTransaction[] {
  const lignes = contenuCsv.split(/\r?\n/).filter((l) => l.trim());
  if (lignes.length < 2) return [];
  if (lignes.length - 1 > 5000) throw new ValidationError("Relevé trop volumineux (max 5000 lignes par import)");

  const sep = (lignes[0].match(/;/g)?.length ?? 0) > (lignes[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: ImportTransaction[] = [];
  for (let i = 1; i < lignes.length; i++) {
    const cols = lignes[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;
    const dateRaw = cols[0];
    const libelle = cols[1] || "";
    let dateIso = dateRaw;
    const fr = dateRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (fr) dateIso = `${fr[3]}-${fr[2]}-${fr[1]}`;
    const toNum = (s: string | undefined) => parseFloat((s || "0").replace(",", ".").replace(/\s/g, ""));
    let montant = toNum(cols[2]);
    if (isNaN(montant) || montant === 0) {
      const debit = toNum(cols[2]);
      const credit = toNum(cols[3]);
      montant = !isNaN(credit) && credit > 0 ? credit : -Math.abs(debit || 0);
    }
    if (!dateIso || isNaN(montant) || !libelle) continue;
    out.push({ dateTransaction: dateIso, libelle, montant, typeTransaction: montant < 0 ? "debit" : "credit" });
  }
  return out;
}
