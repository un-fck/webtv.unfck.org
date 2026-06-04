# syntax=docker/dockerfile:1.7
# Multi-stage build for Azure Container Apps. Produces a small image that
# runs `node server.js` from Next's standalone output. Vercel ignores this
# file entirely and uses its own build pipeline.

ARG NODE_VERSION=22-slim

# ---- deps: install with the lockfile, cache the pnpm store --------------
FROM node:${NODE_VERSION} AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build: compile Next + upload Sentry source maps --------------------
FROM node:${NODE_VERSION} AS build
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time Sentry source-map upload. Pass via --build-arg in CI; left
# unset = no upload (Sentry's plugin silently skips).
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}
ENV CI=1
RUN pnpm build

# ---- runtime: minimal Node + Next standalone output ---------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create a non-root user for the runtime. Next's server can bind 3000 fine
# without root.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output already contains the minimal node_modules needed at
# runtime, plus the server entrypoint. Static assets and the public dir are
# copied separately per the Next docs.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Container Apps health probe hits /api/health (returns 200 + DB ping).
CMD ["node", "server.js"]
