# Backend « nouveau stack » clean-archi (Fastify + tRPC 11 + Drizzle pg).
# Multi-stage, Node Alpine (latest). Build esbuild → bundle ESM unique, runtime = node nu.
#
#   docker build -t operioz-newstack .
#   docker run --rm -e DATABASE_URL=... -e APP_DATABASE_URL=... -e JWT_SECRET=... -p 3001:3001 operioz-newstack

# ── Builder : install complet + bundle du nouveau stack ──────────────────────
FROM node:slim AS builder
WORKDIR /app
ENV CI=true
# pnpm (corepack absent de node:alpine récent) ; version alignée sur packageManager.
RUN npm install -g pnpm@11.5.1
COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
# Sources nécessaires au bundle (src + schéma Drizzle importé en relatif).
COPY tsconfig*.json ./
COPY apps/api ./apps/api
COPY drizzle ./drizzle
# `shared/` (racine) = constantes pures partagées legacy↔new-stack (ex. `shared/permissions.ts` :
# ROLE_TEMPLATES/ALL_PERMISSIONS), importé en relatif depuis src/** → requis au bundle esbuild.
COPY packages/contract ./packages/contract
RUN pnpm build:newstack

# ── Runtime : deps de prod + bundle, utilisateur non-root ────────────────────
FROM node:slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Europe/Paris \
    NEW_STACK_PORT=3001 \
    HOST=0.0.0.0
# ca-certificates : requis par le SDK Bitwarden (rustls) pour le TLS sortant vers identity.bitwarden.com.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.5.1
COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
RUN HUSKY=0 pnpm install --prod --frozen-lockfile --ignore-scripts && pnpm store prune
COPY --from=builder /app/dist-newstack ./dist-newstack
# Migrations Drizzle (SQL + meta/_journal.json) : appliquées au boot par le SDK migrate(). Le bundle
# esbuild n'embarque pas les .sql → on les copie. migrationsFolder = "drizzle" relatif au cwd /app.
COPY --from=builder /app/drizzle ./drizzle
ARG GIT_SHA=unknown
LABEL git.sha=$GIT_SHA
# Tini-less : on lance node directement ; le nouveau stack gère son arrêt.
USER node
EXPOSE 3001
CMD ["node", "--import", "@opentelemetry/instrumentation/hook.mjs", "dist-newstack/server.mjs"]
