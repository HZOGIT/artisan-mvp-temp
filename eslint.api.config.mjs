import tseslint from "typescript-eslint";
import commentsJsdocOnly from "./eslint/comments-jsdoc-only.mjs";

export default tseslint.config({
  plugins: {
    "@typescript-eslint": tseslint.plugin,
    local: { rules: { "comments-jsdoc-only": commentsJsdocOnly } },
  },
  files: ["apps/api/**/*.ts"],
  ignores: ["apps/api/**/*.test.ts", "apps/api/**/*.spec.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: {
    "no-warning-comments": ["error", { terms: ["TODO", "FIXME", "HACK", "XXX"], location: "anywhere" }],
    "local/comments-jsdoc-only": "error",
    "multiline-comment-style": ["error", "starred-block"],
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
});
