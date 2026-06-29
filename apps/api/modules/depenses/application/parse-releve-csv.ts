import { ValidationError } from "../../../shared/errors";
import type { ImportTransaction } from "../domain/transaction-bancaire";

export type ReleveMapping = {
  readonly date: string;
  readonly libelle: string;
  readonly montant?: string;
  readonly debit?: string;
  readonly credit?: string;
};

const DATE_NORM = ["date", "date operation", "date d'operation", "date valeur", "date de valeur"];
const LIB_NORM  = ["libelle", "description", "motif", "wording", "label", "intitule", "commentaire", "designation"];
const MON_NORM  = ["montant", "amount", "montant operation", "valeur"];
const DEB_NORM  = ["debit", "montant debit", "sorties", "retrait"];
const CRE_NORM  = ["credit", "montant credit", "entrees", "versement"];

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a").replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/[ç]/g, "c")
    .trim();
}

function parseDate(raw: string): string {
  const m1 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  const m2 = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return raw;
}

type ColIdx = { date: number; libelle: number; montant?: number; debit?: number; credit?: number; positional: boolean };

function resolveIndices(headers: string[], mapping?: ReleveMapping): ColIdx {
  const byNorm  = (name: string) => headers.findIndex((h) => norm(h) === norm(name));
  const findAny = (aliases: string[]) => headers.findIndex((h) => aliases.includes(norm(h)));

  if (mapping) {
    return {
      date:    byNorm(mapping.date),
      libelle: byNorm(mapping.libelle),
      montant: mapping.montant !== undefined ? byNorm(mapping.montant) : undefined,
      debit:   mapping.debit   !== undefined ? byNorm(mapping.debit)   : undefined,
      credit:  mapping.credit  !== undefined ? byNorm(mapping.credit)  : undefined,
      positional: false,
    };
  }

  const di  = findAny(DATE_NORM);
  const li  = findAny(LIB_NORM);
  const mi  = findAny(MON_NORM);
  const dbi = findAny(DEB_NORM);
  const cri = findAny(CRE_NORM);

  if (di >= 0 && li >= 0 && (mi >= 0 || dbi >= 0 || cri >= 0)) {
    return {
      date: di, libelle: li,
      montant: mi  >= 0 ? mi  : undefined,
      debit:   dbi >= 0 ? dbi : undefined,
      credit:  cri >= 0 ? cri : undefined,
      positional: false,
    };
  }

  /* ponytail: fallback positionnel = comportement legacy exact */
  return { date: 0, libelle: 1, montant: 2, positional: true };
}

/**
 * Parse un relevé bancaire CSV. Mapping optionnel {date, libelle, montant?, debit?, credit?}
 * (noms de colonnes) ; sans mapping : auto-détection par en-tête puis fallback positionnel.
 * Dates : DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD. Séparateur ; / , auto-détecté.
 */
export function parseReleveCsv(contenuCsv: string, mapping?: ReleveMapping): ImportTransaction[] {
  const lignes = contenuCsv.split(/\r?\n/).filter((l) => l.trim());
  if (lignes.length < 2) return [];
  if (lignes.length - 1 > 5000) throw new ValidationError("Relevé trop volumineux (max 5000 lignes par import)");

  const sep     = (lignes[0].match(/;/g)?.length ?? 0) > (lignes[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = lignes[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const idx     = resolveIndices(headers, mapping);

  const toNum = (s: string | undefined) => parseFloat((s || "0").replace(",", ".").replace(/\s/g, ""));
  const out: ImportTransaction[] = [];

  for (let i = 1; i < lignes.length; i++) {
    const cols = lignes[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;
    const dateRaw = idx.date    >= 0 ? (cols[idx.date]    ?? "") : "";
    const libelle = idx.libelle >= 0 ? (cols[idx.libelle] ?? "") : "";
    const dateIso = parseDate(dateRaw);

    let montant: number;
    if (idx.positional) {
      montant = toNum(cols[2]);
      if (isNaN(montant) || montant === 0) {
        const d = toNum(cols[2]);
        const c = toNum(cols[3]);
        montant = !isNaN(c) && c > 0 ? c : -Math.abs(d || 0);
      }
    } else if (idx.montant !== undefined && idx.montant >= 0) {
      montant = toNum(cols[idx.montant]);
    } else {
      const d = idx.debit  !== undefined && idx.debit  >= 0 ? toNum(cols[idx.debit])  : 0;
      const c = idx.credit !== undefined && idx.credit >= 0 ? toNum(cols[idx.credit]) : 0;
      montant = c > 0 ? c : (d > 0 ? -d : NaN);
    }

    if (!dateIso || isNaN(montant) || !libelle) continue;
    out.push({ dateTransaction: dateIso, libelle, montant, typeTransaction: montant < 0 ? "debit" : "credit" });
  }
  return out;
}
