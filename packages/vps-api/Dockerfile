# Single stage build with Debian 11 (bullseye) to match VPS
FROM node:20-bullseye-slim

WORKDIR /app

# Replace apt sources
RUN echo "deb http://deb.debian.org/debian bullseye main contrib non-free" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bullseye-updates main contrib non-free" >> /etc/apt/sources.list && \
    echo "deb http://security.debian.org/debian-security bullseye-security main contrib non-free" >> /etc/apt/sources.list

# Install build tools for native modules
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 build-essential wget g++ make && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

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

# Verify better-sqlite3 is working (use pnpm exec to resolve module)
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
