/** Interdit // (sauf directives eslint-* et @ts-*) ; seuls /** … *​/ autorisés, inline ou non. */
export default {
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
