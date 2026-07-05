# syntax=docker/dockerfile:1.7
# Multi-stage build for Azure Container Apps. Produces an image that runs
# Next's standalone `node server.js` with a sidecar `cron` daemon for
# scheduled tasks (Azure has no platform-side cron facility). The cron
# daemon `curl`s the same `/api/cron/*` HTTP routes that exist on every
# deploy target.
#
# Vercel ignores this file entirely and uses its own build pipeline. Vercel
# also no longer fires the cron routes — `vercel.json` is intentionally
# empty of `crons` entries. The /api/cron/* routes still exist and are
# `Bearer ${CRON_SECRET}`-authenticated, so they can be hit by anyone with
# the secret if a future Vercel-side scheduler ever wants to.

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
# The browser Sentry SDK (error capture + user-feedback widget) only
# initialises when NEXT_PUBLIC_SENTRY_DSN is present. NEXT_PUBLIC_* vars are
# inlined into the client bundle at build time, NOT read at runtime — so the
# DSN MUST be available here, during `pnpm build`. Setting it only in the
# runtime/Azure env is too late and leaves the bundle with the widget gated
# off. The DSN is public (safe to expose in the client bundle); pass via
# --build-arg in CI.
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV CI=1
RUN pnpm build

# ---- runtime: minimal Node + Next standalone output + system cron -------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `cron` provides the daemon + crontab tooling; `curl` fires the per-tick
# HTTP requests against the local Next server; `gettext-base` provides
# `envsubst`, used by entrypoint.sh to inject CRON_SECRET into the crontab
# at boot. `ca-certificates` so curl can talk to https targets if any cron
# task ever needs to. --no-install-recommends keeps the image lean.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      cron curl gettext-base ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Create a non-root user for the Next runtime. The cron daemon needs root
# (to read /etc/cron.d and switch to the user listed per line), so the
# CMD entrypoint runs as root and the crontab itself targets `nextjs` for
# each command.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output already contains the minimal node_modules needed at
# runtime, plus the server entrypoint. Static assets and the public dir are
# copied separately per the Next docs. Owned by nextjs so the unprivileged
# user can actually read what it needs to serve.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Cron pieces: entrypoint script + crontab template. Both stay root-owned;
# the entrypoint runs as root long enough to materialise the crontab and
# launch the cron daemon, then `exec node` becomes PID 1 (still root,
# because dropping privileges between `cron -f &` and `exec node` would
# orphan the daemon and complicate signal handling — accepted trade-off
# for an image that's not otherwise exposed).
COPY docker/entrypoint.sh ./entrypoint.sh
COPY docker/crontab.template /etc/cron.d/un-cron.template
RUN chmod +x ./entrypoint.sh

EXPOSE 3000

# Container Apps health probe hits /api/health (returns 200 + DB ping).
# entrypoint.sh stages the crontab, starts cron, then execs `node server.js`.
CMD ["./entrypoint.sh"]
