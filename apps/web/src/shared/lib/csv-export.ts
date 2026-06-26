/*
 * Export CSV générique — portabilité des données (RGPD art. 20,).
 * 
 * Échappement RFC-4180 : chaque cellule est entre guillemets et les guillemets
 * internes sont doublés → gère sans risque les virgules, retours à la ligne et
 * guillemets présents dans les données (objets, adresses, notes…).
 * + Neutralisation de l'injection de formule (cf.) : une cellule
 *   commençant par = + - @ TAB CR est exécutée par Excel/LibreOffice à
 *   l'ouverture (DDE / =WEBSERVICE). On la préfixe d'une apostrophe pour la
 *   forcer en texte. Les nombres/montants et les numéros de téléphone (chiffres,
 *   espaces, + . , ( ) -) sont laissés intacts → sortie identique pour des
 *   données légitimes.
 * BOM UTF-8 (﻿) pour qu'Excel ouvre correctement les accents.
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const isNombreOuTelephone = (s: string) => /^[+]?[\d\s.,()-]+$/.test(s);
  const escape = (v: string | number | null | undefined) => {
    let s = String(v ?? "");
    if (s !== "" && /^[=+\-@\t\r]/.test(s) && !isNombreOuTelephone(s)) {
      /** anti-injection de formule (sans toucher montants/téléphones) */
      s = "'" + s;
    }
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Suffixe de date YYYY-MM-DD pour nommer les fichiers exportés. */
export function csvDateSuffix(): string {
  return new Date().toISOString().split("T")[0];
}
