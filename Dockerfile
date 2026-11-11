# =============================================================================
# Stage 1: base
# Shared starting point for the build and tools stages (Debian slim).
# Installs system packages and, if provided, trusts the company CA certificate
# so npm install and Prisma downloads work behind the corporate proxy.
# =============================================================================
FROM node:22-bookworm-slim AS base

WORKDIR /app

# Make Node use the system certificate store (which will include the company cert).
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    NODE_OPTIONS=--use-system-ca

# corporate_ca is an optional build secret. It is only installed if one is
# passed in, and it is never saved into the image layers.
RUN --mount=type=secret,id=corporate_ca \
    apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libatomic1 openssl \
    && rm -rf /var/lib/apt/lists \
    && if [ -s /run/secrets/corporate_ca ]; then \
    cp /run/secrets/corporate_ca /usr/local/share/ca-certificates/corporate.crt; \
    update-ca-certificates; \
    fi

# =============================================================================
# Stage 2: build
# Installs all npm packages (including dev), generates the Prisma client and
# bundles the TypeScript app into dist/index.js.
# =============================================================================
FROM base AS build

# Copy only the package files first so Docker can cache the npm install layer.
# HUSKY=0 skips setting up git hooks, which aren't needed inside a container.
COPY package.json package-lock.json ./
RUN HUSKY=0 npm ci

COPY . .
# prisma generate requires DATABASE_URL to be set but does not connect to it,
# so a placeholder URL is used. npm run build typechecks, then esbuild bundles.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run db:generate \
    && npm run build

# =============================================================================
# Stage 3: tools
# Same as build (full source + dev dependencies) but runs as the non-root
# "node" user. Used by the "migrate" service in compose.yaml to apply
# database migrations before the backend starts.
# =============================================================================
FROM build AS tools

USER node

CMD ["npm", "run", "db:deploy"]

# =============================================================================
# Stage 4: runtime-base
# Small Alpine image shared by the production stages. Sets production mode,
# port 3001, and trusts the company CA certificate (if provided).
# =============================================================================
FROM node:22-alpine AS runtime-base

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    NODE_OPTIONS=--use-system-ca

# Add the company cert, then install the runtime libraries Prisma/OpenSSL need.
RUN --mount=type=secret,id=corporate_ca \
    if [ -s /run/secrets/corporate_ca ]; then \
    cat /run/secrets/corporate_ca >> /etc/ssl/certs/ca-certificates.crt; \
    fi \
    && apk add --no-cache ca-certificates libstdc++ openssl \
    && if [ -s /run/secrets/corporate_ca ]; then \
    cp /run/secrets/corporate_ca /usr/local/share/ca-certificates/corporate.crt; \
    update-ca-certificates; \
    fi

# =============================================================================
# Stage 5: production-dependencies
# Installs only production npm packages and clears the npm cache, so the
# final image gets a clean, minimal node_modules folder.
# =============================================================================
FROM runtime-base AS production-dependencies

COPY package.json package-lock.json ./
# Prune build-only optional peers using a production-only image manifest.
RUN npm ci --omit=dev --ignore-scripts \
    && npm pkg delete devDependencies \
    && npm prune --omit=dev --legacy-peer-deps --ignore-scripts \
    && npm cache clean --force

# =============================================================================
# Stage 6: runtime (final image)
# Copies in production node_modules and the compiled app only. No source
# code, dev tools or build cache. Runs as a non-root user for security.
# =============================================================================
FROM runtime-base AS runtime

COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node

EXPOSE 3001

# Docker calls GET /health every 30s. After 3 failures in a row the container
# is marked unhealthy. The frontend in compose.yaml waits for this to pass.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "const response = await fetch(`http://127.0.0.1:${process.env.PORT}/health`); if (!response.ok) throw new Error(`Health check failed: ${response.status}`);"]

CMD ["node", "dist/index.js"]
