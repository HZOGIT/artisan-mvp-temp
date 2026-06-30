/** Interdit les catch/rejection-handler sans log ni rethrow (swallow silencieux). */

const LOG_METHODS = new Set(["log", "warn", "error", "info", "debug", "trace"]);

function walk(node, fn) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  fn(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const val = node[key];
    if (Array.isArray(val)) val.forEach(c => walk(c, fn));
    else if (val && typeof val === "object" && val.type) walk(val, fn);
  }
}

function bodyHasThrow(body) {
  let found = false;
  walk(body, node => { if (node.type === "ThrowStatement") found = true; });
  return found;
}

function bodyHasLogCall(body) {
  let found = false;
  walk(body, node => {
    if (found) return;
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      LOG_METHODS.has(node.callee.property.name)
    ) found = true;
  });
  return found;
}

function bodyHasBestEffortComment(body, sourceCode) {
  const comments = sourceCode.getCommentsInside ? sourceCode.getCommentsInside(body) : [];
  return comments.some(c => /best.effort|ponytail/i.test(c.value));
}

function isSilent(body, sourceCode) {
  if (!body || body.type !== "BlockStatement") return false;
  if (bodyHasThrow(body)) return false;
  if (bodyHasLogCall(body)) return false;
  if (bodyHasBestEffortComment(body, sourceCode)) return false;
  return true;
}

function isHandlerFn(node) {
  return node && (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression");
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Interdit les catch/rejection-handler sans log ni rethrow (swallow silencieux)." },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CatchClause(node) {
        if (isSilent(node.body, sourceCode)) {
          context.report({
            node,
            message: "Catch silencieux : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire.",
          });
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression") return;
        const methodName = node.callee.property.name;
        if (methodName === "catch" && node.arguments.length >= 1) {
          const handler = node.arguments[0];
          if (isHandlerFn(handler) && !handler.expression && isSilent(handler.body, sourceCode)) {
            context.report({
              node: handler,
              message: "Rejection handler silencieux : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire.",
            });
          }
        } else if (methodName === "then" && node.arguments.length >= 2) {
          const handler = node.arguments[1];
          if (isHandlerFn(handler) && !handler.expression && isSilent(handler.body, sourceCode)) {
            context.report({
              node: handler,
              message: "Rejection handler silencieux (.then second arg) : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire.",
            });
          }
        }
      },
    };
  },
};
