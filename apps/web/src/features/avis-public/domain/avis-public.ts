/*
 * Couche DOMAIN de la feature `avis-public` (dépôt d'avis client par token, page publique). Logique pure
 * (libellé de note, date) testable. 0 React/tRPC.
 */

/** Clé i18n du libellé d'une note 1–5 (null si hors plage). PUR. */
export function noteLabelKey(note: number): string | null {
  switch (note) {
    case 1: return "note1";
    case 2: return "note2";
    case 3: return "note3";
    case 4: return "note4";
    case 5: return "note5";
    default: return null;
  }
}

/** Date longue FR. PUR. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
