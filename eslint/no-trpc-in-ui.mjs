/** features/<f>/ui/** interdit d'importer tRPC directement — passer par application/use-<feature>. */
export default {
  meta: {
    type: "suggestion",
    docs: { description: "L'UI ne doit pas importer tRPC ; encapsuler dans application/use-<feature>." },
    schema: [],
  },
  create(context) {
    const file = context.filename ?? context.getFilename();
    if (!/\/features\/[^/]+\/ui\//.test(file)) return {};
    return {
      ImportDeclaration(node) {
        if (node.source.value === "@/modern/shared/trpc") {
          context.report({ node, message: "Clean-archi : la couche ui/ n'importe pas tRPC. Passer par application/use-<feature>." });
        }
      },
    };
  },
};
