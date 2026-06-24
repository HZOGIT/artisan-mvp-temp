/**
 * Warn si une procédure tRPC (.query ou .mutation) est définie sans .input() préalable.
 * Détecte le pattern : t.procedure.query(...) sans .input() dans la chaîne.
 */
export default {
  meta: { type: "suggestion", docs: { description: "Procédure tRPC sans .input() — entrée non validée." }, schema: [] },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const method = callee.property.name;
        if (method !== "query" && method !== "mutation") return;
        let chain = callee.object;
        let hasInput = false;
        while (chain.type === "CallExpression" && chain.callee.type === "MemberExpression") {
          if (chain.callee.property.name === "input") { hasInput = true; break; }
          chain = chain.callee.object;
        }
        if (!hasInput) {
          context.report({ node, message: `Procédure tRPC .${method}() sans .input() — toute entrée est non validée. Ajouter .input(z.xxx).` });
        }
      },
    };
  },
};
