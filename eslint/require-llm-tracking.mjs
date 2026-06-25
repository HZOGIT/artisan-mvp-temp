/**
 * Vérifie que tout appel `*.llm.complete/stream/streamTurn()` dans une fonction
 * est accompagné d'un accès à `*.trackLlm` dans la même fonction.
 *
 * Fonctionne par function-scope stack : à chaque entrée de fonction on empile
 * { llmCalls, hasTracker }, on remplit au fil du parcours AST, on reporte à la
 * sortie si des appels LLM existent sans tracker.
 *
 * Pas d'exclusion de chemin nécessaire : les adapters dans infra/ implémentent
 * LlmPort (leur méthode est `complete`, pas `*.llm.complete`) — aucun faux positif.
 */

const LLM_METHODS = new Set(["complete", "stream", "streamTurn"]);

/** *.llm.complete(...) | *.llm.stream(...) | *.llm.streamTurn(...) */
function isLlmCall(callee) {
  const node = callee.type === "ChainExpression" ? callee.expression : callee;
  return (
    node.type === "MemberExpression" &&
    node.property?.type === "Identifier" &&
    LLM_METHODS.has(node.property.name) &&
    node.object?.type === "MemberExpression" &&
    node.object.property?.type === "Identifier" &&
    node.object.property.name === "llm"
  );
}

/** *.trackLlm — couvre deps.trackLlm?.() et deps.trackLlm() */
function isTrackLlmAccess(node) {
  return (
    node.type === "MemberExpression" &&
    node.property?.type === "Identifier" &&
    node.property.name === "trackLlm"
  );
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Tout appel LLM (llm.complete/stream/streamTurn) doit être accompagné d'un trackLlm() dans la même fonction.",
    },
    schema: [],
  },
  create(context) {
    /** Stack de scopes : un entrée par fonction traversée. */
    const stack = [];

    return {
      ":function"() {
        stack.push({ llmCalls: [], hasTracker: false });
      },

      ":function:exit"() {
        const scope = stack.pop();
        if (!scope || scope.llmCalls.length === 0 || scope.hasTracker) return;
        for (const callNode of scope.llmCalls) {
          context.report({
            node: callNode,
            message:
              "Appel LLM sans tracking — ajouter trackLlm?.({ artisanId, userId, useCase, usage }) dans cette fonction.",
          });
        }
      },

      CallExpression(node) {
        if (stack.length === 0) return;
        if (isLlmCall(node.callee)) {
          stack[stack.length - 1].llmCalls.push(node);
        }
      },

      MemberExpression(node) {
        if (stack.length === 0) return;
        if (isTrackLlmAccess(node)) {
          stack[stack.length - 1].hasTracker = true;
        }
      },
    };
  },
};
