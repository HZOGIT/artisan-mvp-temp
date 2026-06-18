// Couche DOMAIN de la feature `page-construction` (pages publiques « en construction » : contact/aide/guide).
// Pure correspondance chemin → clé de titre i18n. 0 React/tRPC.

const TITLE_KEY: Record<string, string> = {
  "/contact": "titreContact",
  "/aide": "titreAide",
  "/guide": "titreGuide",
};

// Clé i18n du titre depuis un chemin (tolère le préfixe /v2). PUR.
export function titleKeyForPath(pathname: string): string {
  const path = pathname.replace(/^\/v2/, "") || "/";
  return TITLE_KEY[path] ?? "titrePage";
}
