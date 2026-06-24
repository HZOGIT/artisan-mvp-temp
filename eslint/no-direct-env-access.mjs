/** Interdit process.env.X hors fichiers de configuration centralisée. */
export default {
  meta: { type: "suggestion", docs: { description: "process.env interdit hors config.ts — centraliser l'accès aux vars d'env." }, schema: [] },
  create(context) {
    const file = context.filename ?? context.getFilename();
    if (/\/(config|env)(\/[^/]+)?\.ts$|\.config\.ts$/.test(file)) return {};
    return {
      MemberExpression(node) {
        if (
          node.object.type === "MemberExpression" &&
          node.object.object.type === "Identifier" &&
          node.object.object.name === "process" &&
          node.object.property.type === "Identifier" &&
          node.object.property.name === "env"
        ) {
          context.report({ node, message: "process.env interdit ici — accéder aux vars d'env uniquement via un port de configuration (config.ts)." });
        }
      },
    };
  },
};
