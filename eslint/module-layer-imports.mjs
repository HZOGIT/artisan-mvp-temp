/**
 * Enforce la règle de dépendance entre couches clean-archi dans apps/api/modules/ :
 *
 *   domain      → aucune autre couche du même module
 *   application → domain uniquement
 *   infra       → domain et application (pas interface)
 *   interface   → application et domain (pas infra)
 *
 * Seuls les imports relatifs intra-module sont vérifiés (../../infra/…).
 */

const FORBIDDEN = {
  domain:      new Set(["application", "infra", "interface"]),
  application: new Set(["infra", "interface"]),
  infra:       new Set(["interface"]),
  interface:   new Set(["infra"]),
};

function resolveLayer(importPath, currentLayer) {
  // Normalise les ../ pour retrouver la couche cible.
  // Ex: depuis application/, "../infra/foo" → infra
  const parts = importPath.split("/");
  const layers = ["domain", "application", "infra", "interface"];
  for (const part of parts) {
    if (layers.includes(part)) return part;
  }
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Interdit les imports qui violent la hiérarchie des couches clean-archi." },
    schema: [],
  },
  create(context) {
    const file = context.filename ?? context.getFilename();
    const match = file.match(/\/apps\/api\/modules\/([^/]+)\/([^/]+)\//);
    if (!match) return {};

    const currentLayer = match[2];
    const forbidden = FORBIDDEN[currentLayer];
    if (!forbidden) return {};

    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (!src.startsWith(".")) return; // import externe → hors périmètre

        const targetLayer = resolveLayer(src, currentLayer);
        if (!targetLayer || !forbidden.has(targetLayer)) return;

        context.report({
          node,
          message: `Clean-archi : la couche "${currentLayer}" ne peut pas importer depuis "${targetLayer}". Hiérarchie : domain ← application ← interface ; domain ← infra.`,
        });
      },
    };
  },
};
