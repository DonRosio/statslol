# Image of the web app, run by deploy/compose.yaml: Caddy serving the files that Vite builds.
# Built from the root of the repository (only the files listed in .dockerignore are sent):
#   docker build --file apps/web/Dockerfile --tag statslol-web .

# --- Stage 1: build the web app -------------------------------------------------------
# Same Node.js image as apps/api/Dockerfile.
FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
# Corepack installs the version of pnpm pinned in package.json, and checks its hash.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
# The lockfile alone first: Docker reuses this layer, the slowest, until it changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
# Vite and its plugins are development dependencies: needed to build. No scripts: the
# root's "prepare" needs git.
RUN pnpm install --offline --frozen-lockfile --ignore-scripts \
      --filter @statslol/web...
COPY tsconfig.base.json ./
COPY apps/web apps/web/
COPY packages/core/src packages/core/src/
COPY packages/shared/src packages/shared/src/
# vite build, then the check that no secret is in the files (scripts/check-bundle.ts).
RUN pnpm --filter @statslol/web build

# --- Stage 2: the image that runs ---------------------------------------------------------
FROM caddy:2.11-alpine@sha256:881bbc60f9986d5ab8e7cfd6cf7e4ef3c9c0439fef2429d035d065577882f028
# The image lets Caddy open ports below 1024 through a file capability. Linux refuses to
# start a program with such a capability once the container has dropped them all
# (deploy/compose.yaml), and port 8080 does not need it.
RUN setcap -r /usr/bin/caddy
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv/
LABEL org.opencontainers.image.source=https://github.com/DonRosio/statslol \
      org.opencontainers.image.description="statslol: the web app"
# Caddy keeps its state under these folders: in /tmp, the only place it may write.
ENV XDG_CONFIG_HOME=/tmp/caddy-config XDG_DATA_HOME=/tmp/caddy-data
EXPOSE 8080
# Alpine's unprivileged user: the files of /srv belong to root, Caddy can only read them.
USER nobody
