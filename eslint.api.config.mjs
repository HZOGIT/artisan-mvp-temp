// Gate ESLint pour le backend new-stack (`apps/api/**`).
// Exécution : pnpm lint:api
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Plugin TS-ESLint chargé pour que les eslint-disable @typescript-eslint/* existants soient reconnus.
    plugins: { "@typescript-eslint": tseslint.plugin },
    files: ["apps/api/**/*.ts"],
    ignores: ["apps/api/**/*.test.ts", "apps/api/**/*.spec.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      // Convention commentaires : JSDoc uniquement (pas de //). Tickets OPE-XXX OK dans les JSDoc.
      "no-warning-comments": ["error", { terms: ["TODO", "FIXME", "HACK", "XXX"], location: "anywhere" }],
      "no-inline-comments": "error",
      "multiline-comment-style": ["error", "starred-block"],
      // Console : interdit sauf désactivation explicite (les no-console intentionnels ont déjà eslint-disable-next-line).
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
