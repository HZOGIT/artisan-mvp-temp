const ACTION_TYPE_PATTERN = /^[a-z]+\.[a-z_]+$/;

function isOutboxOrEmitCall(callee) {
  return (
    callee.type === "Identifier" &&
    (callee.name === "outboxEvent" || callee.name === "emitEvent")
  );
}

function getActionOrTypeLiteral(eventObjArg, key) {
  if (!eventObjArg || eventObjArg.type !== "ObjectExpression") return null;
  const prop = eventObjArg.properties.find(
    (p) => p.type === "Property" && p.key.name === key
  );
  if (prop?.value?.type === "Literal" && typeof prop.value.value === "string") {
    return prop.value;
  }
  return null;
}

function getFirstArgName(node) {
  const first = node.arguments[0];
  if (first?.type === "Identifier") return first.name;
  return null;
}

function isInvalidFirstArg(firstArg) {
  if (!firstArg) return false;
  if (firstArg.type === "MemberExpression") return true;
  if (firstArg.type === "CallExpression") return true;
  return false;
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce events/outbox convention: action/type pattern, ban emitEvent in routers, atomicity with tx",
    },
    schema: [],
  },
  create(context) {
    const file = context.filename ?? context.getFilename();
    const isTrpcRouter = /\/modules\/[^/]+\/interface\/trpc\//.test(file);

    return {
      CallExpression(node) {
        if (!isOutboxOrEmitCall(node.callee)) return;

        const fnName = node.callee.name;
        const eventObjArg = node.arguments[2];

        if (fnName === "emitEvent") {
          if (isTrpcRouter) {
            context.report({
              node,
              message:
                "Utiliser outboxEvent dans un withOutbox (atomicité ACID) — cf. pilote #126. emitEvent est fire-and-forget non transactionnel.",
            });
          }
          const typeLiteral = getActionOrTypeLiteral(eventObjArg, "type");
          if (typeLiteral && !ACTION_TYPE_PATTERN.test(typeLiteral.value)) {
            context.report({
              node: typeLiteral,
              message: `Type d'événement doit être au format 'module.action' (ex. 'devis.cree'), pas '${typeLiteral.value}'.`,
            });
          }
          return;
        }

        if (fnName === "outboxEvent") {
          const actionLiteral = getActionOrTypeLiteral(eventObjArg, "action");
          if (actionLiteral && !ACTION_TYPE_PATTERN.test(actionLiteral.value)) {
            context.report({
              node: actionLiteral,
              message: `Action d'événement doit être au format 'module.action' (ex. 'devis.cree'), pas '${actionLiteral.value}'.`,
            });
          }

          const firstArgName = getFirstArgName(node);
          if (firstArgName && firstArgName !== "tx") {
            context.report({
              node,
              message:
                "outboxEvent doit recevoir tx en premier argument pour l'atomicité ACID — cf. PR #126.",
            });
          }
          if (isInvalidFirstArg(node.arguments[0])) {
            context.report({
              node,
              message:
                "outboxEvent doit recevoir tx en premier argument pour l'atomicité ACID — cf. PR #126.",
            });
          }
        }
      },
    };
  },
};
