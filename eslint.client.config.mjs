// Gate ESLint DÉDIÉ au FRONT NEUF de la refonte (`apps/web/src/**`). Distinct de l'ESLint global
// (OPE-413) : il ne lint QUE le code neuf et fait respecter ses specs (frontière strangler, pas de REST,
// kebab-case des fichiers, i18n). Enrichi itérativement. Exécution : `pnpm exec eslint -c eslint.client.config.mjs apps/web/src`.
import tseslint from "typescript-eslint";
import i18next from "eslint-plugin-i18next";

// Règle custom : nom de fichier en kebab-case (le composant exporté reste PascalCase, seul le fichier
// est kebab). Cohérent avec les primitives shadcn et la convention imposée de la refonte.
const kebabFilename = {
  meta: {
    type: "problem",
    docs: { description: "Les noms de fichiers du code neuf doivent être en kebab-case." },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const full = context.filename ?? context.getFilename();
        const base = (full.split("/").pop() ?? "");
        // Retire suffixes de test puis extensions (.d.ts, .ts, .tsx, .json).
        const name = base
          .replace(/\.(test|spec)\.(ts|tsx)$/, "")
          .replace(/\.d\.ts$/, "")
          .replace(/\.(ts|tsx|json)$/, "");
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
          context.report({ node, message: `Nom de fichier non kebab-case : "${base}". Utiliser kebab-case (ex: clients-list-page.tsx).` });
        }
      },
    };
  },
};

// Règle custom (clean-archi) : la couche `features/<f>/ui/**` ne doit PAS importer tRPC directement —
// elle passe par la couche application (`use-<feature>`). Rétrofit terminé (Vague R : 14/14 features) →
// règle en **`error`** : verrou définitif de la frontière (ui = présentation pure, application = seule
// couche tRPC). Toute nouvelle page doit naître clean-archi.
const noTrpcInUi = {
  meta: {
    type: "suggestion",
    docs: { description: "L'UI ne doit pas importer tRPC ; encapsuler dans application/use-<feature>." },
    schema: [],
  },
  create(context) {
    const file = context.filename ?? context.getFilename();
    if (!/\/features\/[^/]+\/ui\//.test(file)) return {};
    return {
      ImportDeclaration(node) {
        if (node.source.value === "@/modern/shared/trpc") {
          context.report({ node, message: "Clean-archi : la couche ui/ n'importe pas tRPC. Passer par application/use-<feature>." });
        }
      },
    };
  },
};

export default tseslint.config({
  files: ["apps/web/src/**/*.{ts,tsx}"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: {
    local: { rules: { "kebab-filename": kebabFilename, "no-trpc-in-ui": noTrpcInUi } },
    i18next,
  },
  rules: {
    "local/kebab-filename": "error",
    "local/no-trpc-in-ui": "error",
    // Convention commentaires : JSDoc uniquement (pas de //). Tickets OPE-XXX OK dans les JSDoc.
    "no-warning-comments": ["error", { terms: ["TODO", "FIXME", "HACK", "XXX"], location: "anywhere" }],
    "no-inline-comments": "error",
    "multiline-comment-style": ["error", "starred-block"],
    // Frontière strangler + pas de REST : le neuf passe par les coutures partagées.
    "no-restricted-imports": [
      "error",
      {
        paths: [
          { name: "@/lib/trpc", message: "Importer tRPC via `@/modern/shared/trpc` (client partagé), pas `@/lib/trpc`." },
          { name: "openapi-fetch", message: "Pas de REST dans le neuf : utiliser tRPC (`@/modern/shared/trpc`)." },
          { name: "openapi-react-query", message: "Pas de REST dans le neuf : utiliser tRPC (`@/modern/shared/trpc`)." },
        ],
        patterns: [
          { group: ["@/components/ui/*"], message: "Importer les primitives via `@/modern/shared/ui` (copie conforme), pas `@/components/ui/*`." },
          { group: ["@/modern/shared/api", "@/modern/shared/api/*"], message: "Couche REST PoC supprimée : utiliser `@/modern/shared/trpc`." },
        ],
      },
    ],
    // i18n : aucune chaîne utilisateur en dur dans le JSX (uniquement le texte visible).
    // `words.exclude` ignore le texte SANS lettre (glyphes/ponctuation : « ✕ », séparateurs…).
    "i18next/no-literal-string": ["error", { mode: "jsx-text-only", words: { exclude: ["^[^A-Za-zÀ-ÿ]+$"] } }],
  },
},
// Coutures vers le legacy : SEULS endroits autorisés à importer `@/components/ui/*` (copie conforme)
// et `@/lib/trpc` (instance partagée). On y désactive donc la frontière d'imports.
{
  files: ["apps/web/src/shared/ui/**", "apps/web/src/shared/trpc/**"],
  rules: { "no-restricted-imports": "off" },
},
// Page de démonstration du socle (dev only, pas une vraie page produit) → pas d'exigence i18n.
{
  files: ["apps/web/src/features/_demo/**"],
  rules: { "i18next/no-literal-string": "off" },
});
