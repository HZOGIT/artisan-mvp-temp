import tseslint from "typescript-eslint";
import i18next from "eslint-plugin-i18next";
import commentsJsdocOnly from "./eslint/comments-jsdoc-only.mjs";
import kebabFilename from "./eslint/kebab-filename.mjs";
import noTrpcInUi from "./eslint/no-trpc-in-ui.mjs";

export default tseslint.config(
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "apps/web/src/**/*.spec.ts", "apps/web/src/**/*.spec.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
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
      "no-eval": "error",
      "no-new-func": "error",
      "no-prototype-builtins": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
      "@typescript-eslint/require-await": "error",
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
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { "local/comments-jsdoc-only": "off", "multiline-comment-style": "off" },
  },
);
