# Backend « nouveau stack » clean-archi (Fastify + tRPC 11 + Drizzle pg).
# Multi-stage, Node Alpine (latest). Build esbuild → bundle ESM unique, runtime = node nu.
#
#   docker build -t operioz-newstack .
#   docker run --rm -e DATABASE_URL=... -e APP_DATABASE_URL=... -e JWT_SECRET=... -p 3001:3001 operioz-newstack

# ── Builder : install complet + bundle du nouveau stack ──────────────────────
FROM node:alpine AS builder
WORKDIR /app
ENV CI=true
# pnpm (corepack absent de node:alpine récent) ; version alignée sur packageManager.
RUN npm install -g pnpm@10.4.1
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
# Sources nécessaires au bundle (src + schéma Drizzle importé en relatif).
COPY tsconfig*.json ./
COPY src ./src
COPY drizzle ./drizzle
RUN pnpm build:newstack

# ── Runtime : deps de prod + bundle, utilisateur non-root ────────────────────
FROM node:alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEW_STACK_PORT=3001 \
    HOST=0.0.0.0
RUN npm install -g pnpm@10.4.1
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --from=builder /app/dist-newstack ./dist-newstack
# Tini-less : on lance node directement ; le nouveau stack gère son arrêt.
USER node
EXPOSE 3001
CMD ["node", "dist-newstack/server.mjs"]
