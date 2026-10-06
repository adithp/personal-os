# Build context is the repository root:
#   docker buildx build --platform linux/arm64 -f apps/server/Dockerfile -t personal-os-server .
#
# The server is bundled into ONE JavaScript file (tsup), so it is built on the machine's own
# platform (fast, no emulation) and only the small runtime image is made for the target
# platform (linux/arm64 on the Oracle server).

# ---- 1. Install dependencies (build platform) --------------------------------------------
FROM --platform=$BUILDPLATFORM node:22.23.3-alpine AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Only the files that decide which packages are installed, so this layer is cached
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

# Install exactly what pnpm-lock.yaml says, and only for the server and what it uses
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @personal-os/server...

# ---- 2. Build the server bundle (build platform) -----------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/server apps/server
RUN pnpm --filter @personal-os/server build

# ---- 3. Runtime image (target platform) --------------------------------------------------
FROM node:22.23.3-alpine AS runtime
ENV NODE_ENV=production
# Listen on all interfaces inside the container; Compose only exposes it to Caddy
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/server/dist/index.js /repo/apps/server/dist/index.js.map ./

# Never run as root
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null || exit 1

CMD ["node", "--enable-source-maps", "index.js"]
