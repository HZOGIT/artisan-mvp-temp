/**
 * Gate ESLint DÉDIÉ au FRONT NEUF de la refonte (`apps/web/src/**`). Distinct de l'ESLint global :
 * il ne lint QUE le code neuf et fait respecter ses specs (frontière strangler, pas de REST,
 * kebab-case des fichiers, i18n). Enrichi itérativement.
 * Exécution : `pnpm exec eslint -c eslint.web.config.mjs apps/web/src`
 */
import tseslint from "typescript-eslint";
import i18next from "eslint-plugin-i18next";

/**
 * Interdit les commentaires // (sauf directives ESLint/@ts-*) et les commentaires
 * inline non-JSDoc. Seuls /** … * / sont autorisés, inline ou non.
 */
const commentsJsdocOnly = {
  meta: {
    type: "suggestion",
    docs: { description: "// interdit partout ; inline = JSDoc (/** */) uniquement." },
    schema: [],
  },
  create(context) {
    const src = context.sourceCode;
    return {
      Program(node) {
        const allComments = src.ast?.comments ?? src.getCommentsInside?.(node) ?? [];
        const lines = src.getText().split("\n");
        for (const comment of allComments) {
          if (comment.type === "Line") {
            const v = comment.value.trimStart();
            if (v.startsWith("eslint-") || v.startsWith("@ts-")) continue;
            context.report({ loc: comment.loc, message: "// interdit : utiliser /** … */ à la place." });
          } else if (comment.type === "Block" && !comment.value.startsWith("*")) {
            const startLine = lines[comment.loc.start.line - 1] ?? "";
            const before = startLine.substring(0, comment.loc.start.column).trim();
            const endLine = lines[comment.loc.end.line - 1] ?? "";
            const after = endLine.substring(comment.loc.end.column).trim();
            // JSX brace-comment and empty-catch pattern — intentional, not a TS inline comment
            const isJsxLike = before.endsWith("{") && after.startsWith("}");
            if ((before !== "" || after !== "") && !isJsxLike) {
              context.report({ loc: comment.loc, message: "Commentaire inline non-JSDoc : utiliser /** … */ à la place." });
            }
          }
        }
      },
    };
  },
};

/** Nom de fichier en kebab-case (composant exporté reste PascalCase, seul le fichier est kebab). */
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

/**
 * Clean-archi : `features/<f>/ui/**` interdit d'importer tRPC directement — passer par
 * `application/use-<feature>`. Vague R terminée (14/14) → règle en error (verrou définitif).
 */
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
    local: { rules: { "kebab-filename": kebabFilename, "no-trpc-in-ui": noTrpcInUi, "comments-jsdoc-only": commentsJsdocOnly } },
    i18next,
  },
  rules: {
    "local/kebab-filename": "error",
    "local/no-trpc-in-ui": "error",
    "no-warning-comments": ["error", { terms: ["TODO", "FIXME", "HACK", "XXX"], location: "anywhere" }],
    "local/comments-jsdoc-only": "error",
    "multiline-comment-style": ["error", "starred-block"],
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
    "i18next/no-literal-string": ["error", { mode: "jsx-text-only", words: { exclude: ["^[^A-Za-zÀ-ÿ]+$"] } }],
  },
},
{
  files: ["apps/web/src/shared/ui/**", "apps/web/src/shared/trpc/**"],
  rules: { "no-restricted-imports": "off" },
},
{
  files: ["apps/web/src/features/_demo/**"],
  rules: { "i18next/no-literal-string": "off" },
},
{
  files: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "apps/web/src/**/*.spec.ts", "apps/web/src/**/*.spec.tsx"],
  rules: { "local/comments-jsdoc-only": "off", "multiline-comment-style": "off" },
});
