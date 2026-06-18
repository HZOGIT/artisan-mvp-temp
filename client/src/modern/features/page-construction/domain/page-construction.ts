// Couche DOMAIN de la feature `page-construction` (pages publiques « en construction » : contact/aide/guide).
// Pure correspondance chemin → clé de titre i18n. 0 React/tRPC.

const TITLE_KEY: Record<string, string> = {
  "/contact": "titreContact",
  "/aide": "titreAide",
  "/guide": "titreGuide",
};

// Clé i18n du titre depuis un chemin. PUR.
export function titleKeyForPath(pathname: string): string {
  const path = pathname || "/";
  return TITLE_KEY[path] ?? "titrePage";
}
