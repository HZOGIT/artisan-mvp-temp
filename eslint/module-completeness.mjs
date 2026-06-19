/**
 * Vérifie que chaque module sous apps/api/modules/ possède les 4 couches obligatoires
 * et les fichiers de composition attendus. Utilise fs.existsSync depuis le premier
 * fichier rencontré dans chaque module (Set pour ne reporter qu'une fois par module).
 *
 * Éléments requis :
 *   domain/              infra/
 *   application/         interface/
 *   <module>.module.ts   index.ts
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const REQUIRED_LAYERS = ["domain", "application", "infra", "interface"];
const checked = new Set();

export default {
  meta: {
    type: "problem",
    docs: { description: "Un module doit contenir les 4 couches (domain/application/infra/interface) et ses fichiers de composition." },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const file = context.filename ?? context.getFilename();
        const match = file.match(/^(.*\/apps\/api\/modules\/([^/]+))\//);
        if (!match) return;

        const moduleRoot = match[1];
        const moduleName = match[2];

        if (checked.has(moduleRoot)) return;
        checked.add(moduleRoot);

        const missing = [];
        for (const layer of REQUIRED_LAYERS) {
          if (!existsSync(join(moduleRoot, layer))) missing.push(`${layer}/`);
        }
        if (!existsSync(join(moduleRoot, `${moduleName}.module.ts`))) missing.push(`${moduleName}.module.ts`);
        if (!existsSync(join(moduleRoot, "index.ts"))) missing.push("index.ts");

        if (missing.length > 0) {
          context.report({
            node,
            message: `Module "${moduleName}" incomplet — éléments manquants : ${missing.join(", ")}.`,
          });
        }
      },
    };
  },
};
