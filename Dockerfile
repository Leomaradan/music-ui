# syntax=docker/dockerfile:1
# Music UI — production image (PLAN.md §10). Build: docker build -t music-ui .

ARG NODE_IMAGE=node:26-alpine

# ---- dependencies ----------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Node 26 no longer ships corepack: install the pnpm version pinned in package.json.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]")" \
 && npm install --global --no-fund --no-audit "pnpm@${PNPM_VERSION}" \
 && pnpm install --frozen-lockfile

# ---- build -----------------------------------------------------------------------------
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# next/font downloads Roboto from Google Fonts here (build time only).
RUN pnpm build

# ---- runtime ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
LABEL org.opencontainers.image.title="music-ui" \
      org.opencontainers.image.description="Web music player for a Navidrome server" \
      org.opencontainers.image.source="https://github.com/leomaradan/music-ui" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app
# The standalone server bundles only the dependencies it uses; static assets are copied
# next to it (Next.js does not include them in the standalone output).
COPY --from=build --chown=99:100 /app/.next/standalone ./
COPY --from=build --chown=99:100 /app/.next/static ./.next/static
# User management for the login screen: docker exec -it music-ui node cli.mjs user add <name>
COPY --from=build --chown=99:100 /app/scripts/cli.mjs /app/scripts/password.mjs ./

# Unraid convention: run as nobody:users (99:100), the owner of /mnt/user/appdata.
RUN mkdir -p /data && chown 99:100 /data
USER 99:100
VOLUME /data
EXPOSE 3000

# Healthy while the app answers (an unreachable Navidrome is reported as "degraded", not
# unhealthy: restarting the app would not fix it).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]
