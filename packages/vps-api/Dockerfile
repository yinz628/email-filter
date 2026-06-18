# Use the full Node image so native build tooling is already present.
FROM node:20-bookworm

WORKDIR /app

# Pin pnpm to a Node 20 compatible version so Docker builds remain reproducible.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy package.json files
COPY packages/shared/package.json ./packages/shared/
COPY packages/vps-api/package.json ./packages/vps-api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Force rebuild better-sqlite3 from source in pnpm store
RUN SQLITE_DIR=$(find /app/node_modules/.pnpm -type d -name "better-sqlite3" | grep "node_modules/better-sqlite3$" | head -1) && \
    echo "Found better-sqlite3 at: $SQLITE_DIR" && \
    cd "$SQLITE_DIR" && \
    npm run build-release && \
    ls -la build/Release/

# Verify better-sqlite3 is working
RUN cd /app/packages/vps-api && pnpm exec node -e "require('better-sqlite3'); console.log('✓ better-sqlite3 compiled successfully')"

# Copy source files
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/vps-api/ ./packages/vps-api/

# Build shared first, then vps-api
RUN pnpm --filter @email-filter/shared build && \
    pnpm --filter @email-filter/vps-api build

# Copy schema.sql to dist
RUN cp packages/vps-api/src/db/schema.sql packages/vps-api/dist/db/

# Create data directory with correct permissions
RUN mkdir -p /app/data && chown -R node:node /app/data && chmod 755 /app/data

WORKDIR /app/packages/vps-api

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/filter.db

EXPOSE 3000

# Use root to ensure we can write to mounted volume, then switch to node
USER root
CMD ["sh", "-c", "chown -R node:node /app/data && chmod 755 /app/data && su node -c 'node dist/index.js'"]
