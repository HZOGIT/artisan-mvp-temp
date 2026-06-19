/*
 * Normalisation pour recherche insensible aux accents et a la casse.
 * NFD decompose les caracteres accentues en "lettre + diacritique combinant"
 * (ex : un "e" accent aigu devient "e" + U+0301), puis on supprime tous les
 * diacritiques de la plage Unicode U+0300-U+036F via ̀-ͯ.
 * 
 * Resultat : "Cafe" et "Cafe accent aigu" deviennent tous deux "cafe".
 * L'utilisateur peut taper "evi" et trouver "Evrard" comme "Evrard accentue".
 */

export function normalizeSearch(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function matchSearch(text: string | null | undefined, query: string | null | undefined): boolean {
  const q = normalizeSearch(query);
  /** requete vide = match tout, comportement standard d'un filtre */
  if (!q) return true;
  return normalizeSearch(text).includes(q);
}
