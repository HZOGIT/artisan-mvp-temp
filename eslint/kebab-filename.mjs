/** Nom de fichier en kebab-case (le composant exporté reste PascalCase). */
export default {
  meta: {
    type: "problem",
    docs: { description: "Les noms de fichiers doivent être en kebab-case." },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const full = context.filename ?? context.getFilename();
        const base = full.split("/").pop() ?? "";
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
