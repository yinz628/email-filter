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
COPY packages/vps-admin/package.json ./packages/vps-admin/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Force rebuild better-sqlite3 from source in pnpm store
RUN SQLITE_DIR=$(find /app/node_modules/.pnpm -type d -name "better-sqlite3" | grep "node_modules/better-sqlite3$" | head -1) && \
    echo "Found better-sqlite3 at: $SQLITE_DIR" && \
    cd "$SQLITE_DIR" && \
    npm run build-release && \
    ls -la build/Release/

# Verify better-sqlite3 is working (use pnpm exec to resolve module)
RUN cd /app/packages/vps-admin && pnpm exec node -e "require('better-sqlite3'); console.log('✓ better-sqlite3 compiled successfully')"

# Copy source files
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/vps-admin/ ./packages/vps-admin/

# Build shared first, then vps-admin
RUN pnpm --filter @email-filter/shared build && \
    pnpm --filter @email-filter/vps-admin build

# Copy schema.sql to dist
RUN cp packages/vps-admin/src/db/schema.sql packages/vps-admin/dist/db/

# Create data directory with correct permissions
RUN mkdir -p /app/data && chown -R node:node /app/data && chmod 755 /app/data

WORKDIR /app/packages/vps-admin

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV ADMIN_DB_PATH=/app/data/admin.db

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Use root to ensure we can write to mounted volume, then switch to node
USER root
CMD ["sh", "-c", "chown -R node:node /app/data && chmod 755 /app/data && su node -c 'node dist/index.js'"]
