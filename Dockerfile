FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    NODE_OPTIONS=--use-system-ca

RUN --mount=type=secret,id=corporate_ca \
    apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libatomic1 openssl \
    && rm -rf /var/lib/apt/lists \
    && if [ -s /run/secrets/corporate_ca ]; then \
         cp /run/secrets/corporate_ca /usr/local/share/ca-certificates/corporate.crt; \
         update-ca-certificates; \
       fi

FROM base AS build

COPY package.json package-lock.json ./
RUN HUSKY=0 npm ci

COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run db:generate \
    && npm run build

FROM build AS tools

USER node

CMD ["npm", "run", "db:deploy"]

FROM node:22-alpine AS runtime-base

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    NODE_OPTIONS=--use-system-ca

RUN --mount=type=secret,id=corporate_ca \
    if [ -s /run/secrets/corporate_ca ]; then \
      cat /run/secrets/corporate_ca >> /etc/ssl/certs/ca-certificates.crt; \
    fi \
    && apk add --no-cache ca-certificates libstdc++ openssl \
    && if [ -s /run/secrets/corporate_ca ]; then \
         cp /run/secrets/corporate_ca /usr/local/share/ca-certificates/corporate.crt; \
         update-ca-certificates; \
       fi

FROM runtime-base AS production-dependencies

COPY package.json package-lock.json ./
# Prune build-only optional peers using a production-only image manifest.
RUN npm ci --omit=dev --ignore-scripts \
    && npm pkg delete devDependencies \
    && npm prune --omit=dev --legacy-peer-deps --ignore-scripts \
    && npm cache clean --force

FROM runtime-base AS runtime

COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "const response = await fetch(`http://127.0.0.1:${process.env.PORT}/health`); if (!response.ok) throw new Error(`Health check failed: ${response.status}`);"]

CMD ["node", "dist/index.js"]
