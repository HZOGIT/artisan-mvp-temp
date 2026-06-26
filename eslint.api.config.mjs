import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import commentsJsdocOnly from "./eslint/comments-jsdoc-only.mjs";
import moduleLayerStructure from "./eslint/module-layer-structure.mjs";
import moduleLayerImports from "./eslint/module-layer-imports.mjs";
import moduleCompleteness from "./eslint/module-completeness.mjs";
import noDirectEnvAccess from "./eslint/no-direct-env-access.mjs";
import requireZodInput from "./eslint/require-zod-input.mjs";
import requireLlmTracking from "./eslint/require-llm-tracking.mjs";
import eventsOutboxConvention from "./eslint/events-outbox-convention.mjs";

export default tseslint.config(
  {
  plugins: {
    "@typescript-eslint": tseslint.plugin,
    "import-x": importX,
    local: {
      rules: {
        "comments-jsdoc-only": commentsJsdocOnly,
        "module-layer-structure": moduleLayerStructure,
        "module-layer-imports": moduleLayerImports,
        "module-completeness": moduleCompleteness,
        "no-direct-env-access": noDirectEnvAccess,
        "require-zod-input": requireZodInput,
        "require-llm-tracking": requireLlmTracking,
        "events-outbox-convention": eventsOutboxConvention,
      },
    },
  },
  files: ["apps/api/**/*.ts"],
  ignores: ["apps/api/**/*.test.ts", "apps/api/**/*.spec.ts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: "./tsconfig.api.json",
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-warning-comments": ["error", { terms: ["TODO", "FIXME", "HACK", "XXX", "OPE-"], location: "anywhere" }],
    "local/comments-jsdoc-only": "error",
    "multiline-comment-style": ["error", "starred-block"],
    "no-console": ["error", { allow: ["warn", "error"] }],
    "local/module-layer-structure": "error",
    "local/module-layer-imports": "error",
    "local/module-completeness": "error",
    "no-eval": "error",
    "no-new-func": "error",
    "no-prototype-builtins": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
    "@typescript-eslint/require-await": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/promise-function-async": "warn",
    "import-x/no-cycle": ["warn", { maxDepth: 5 }],
    "local/no-direct-env-access": "warn",
    "local/require-zod-input": "warn",
    "local/require-llm-tracking": "error",
    "local/events-outbox-convention": "error",
  },
  },
  {
    files: [
      "apps/api/**/*-fake.ts",
      "apps/api/**/fakes.ts",
      "apps/api/shared/ports/stripe-adapter.ts",
      "apps/api/shared/ports/billing-adapter.ts",
      "apps/api/shared/ports/password-hasher-bcrypt.ts",
    ],
    rules: { "@typescript-eslint/require-await": "off" },
  },
);
