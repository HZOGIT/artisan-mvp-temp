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
      // Convention commentaires : WHY uniquement, pas de tickets dans le code.
      "no-warning-comments": ["error", { terms: ["TODO", "FIXME", "HACK", "XXX", "OPE-"], location: "anywhere" }],
      "spaced-comment": ["error", "always", { exceptions: ["─", "=", "-"], markers: ["⚠️", "!"] }],
      // Console : interdit sauf désactivation explicite (les no-console intentionnels ont déjà eslint-disable-next-line).
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
