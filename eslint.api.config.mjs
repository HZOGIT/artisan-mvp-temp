import tseslint from "typescript-eslint";

/**
 * Interdit les commentaires // (sauf directives ESLint/@ts-*) et les commentaires
 * inline non-JSDoc (/* … * /). Seuls /** … * / sont autorisés, inline ou non.
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

export default tseslint.config(
  {
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
  },
);
