/**
 * Tout fichier sous apps/api/modules/<module>/ doit être soit à la racine du module,
 * soit dans l'une des 4 couches autorisées : domain, application, infra, interface.
 */

const ALLOWED_LAYERS = new Set(["domain", "application", "infra", "interface"]);

export default {
  meta: {
    type: "problem",
    docs: { description: "Les fichiers d'un module doivent être dans domain/, application/, infra/ ou interface/." },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const file = context.filename ?? context.getFilename();
        const match = file.match(/\/apps\/api\/modules\/([^/]+)\/([^/]+)\//);
        if (!match) return;
        const layer = match[2];
        if (!ALLOWED_LAYERS.has(layer)) {
          context.report({
            node,
            message: `Dossier interdit dans le module "${match[1]}" : "${layer}/". Utiliser domain/, application/, infra/ ou interface/.`,
          });
        }
      },
    };
  },
};
