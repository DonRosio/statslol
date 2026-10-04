# Image of the API, run by deploy/compose.yaml. Built from the root of the repository, which
# holds the lockfile of the workspace (only the files listed in .dockerignore are sent):
#   docker build --file apps/api/Dockerfile --tag statslol-api .

# Node.js 24 on Alpine Linux, pinned by digest like the images of compose.yaml: the tag
# alone could be moved to other contents. Dependabot proposes the updates.
FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS node

# --- Stage 1: install the dependencies the API runs with ---------------------------------
FROM node AS build
WORKDIR /app
# Corepack installs the version of pnpm pinned in package.json, and checks its hash.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
# The lockfile alone first: Docker reuses this layer, the slowest, until it changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod
COPY apps/api/package.json apps/api/
COPY packages/riot-client/package.json packages/riot-client/
COPY packages/shared/package.json packages/shared/
# Only the API and the packages it uses, without their development tools. No scripts: the
# root's "prepare" needs git, and no dependency of the API has an install script.
RUN pnpm install --offline --frozen-lockfile --prod --ignore-scripts \
      --filter @statslol/api...
COPY apps/api/src apps/api/src/
COPY apps/api/drizzle apps/api/drizzle/
COPY packages/riot-client/src packages/riot-client/src/
COPY packages/shared/src packages/shared/src/

# --- Stage 2: the image that runs ---------------------------------------------------------
FROM node
# npm, Yarn and Corepack are not needed to run the API: fewer programs, fewer flaws.
RUN rm -r /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
# The files belong to root: the API can read its code, not change it.
COPY --from=build /app ./
LABEL org.opencontainers.image.source=https://github.com/DonRosio/statslol \
      org.opencontainers.image.description="statslol: the API"
# HOST 0.0.0.0: in a container, "localhost" would only accept connections from inside it.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
# The unprivileged user of the Node.js image.
USER node
# Node.js runs the TypeScript files as they are (type stripping), as in development. Same
# image for the migrations: node apps/api/src/db/migrate.ts
CMD ["node", "apps/api/src/server.ts"]
