/*
 * Validation IBAN (format + clé de contrôle MOD-97). Pur. Porté du legacy `isValidIban`.
 * Vide/absent → considéré valide (champ optionnel).
 */
export function isValidIban(value: string | null | undefined): boolean {
  if (!value) return true;
  const s = value.replace(/\s+/g, "").toUpperCase();
  if (s === "") return true;
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  /** 4 premiers caractères déplacés en fin, lettres → chiffres (A=10..Z=35). */
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  /** MOD-97 par blocs (bornes des nombres JS). */
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

/** Normalise un libellé en slug URL (accents retirés, minuscules, séparateurs `-`, ≤200). "" si vide. */
export function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 200);
}
