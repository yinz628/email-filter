# Build stage - use Debian for better native module support
FROM node:20-bookworm AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.json ./

# Copy package files
COPY packages/shared/package.json ./packages/shared/
COPY packages/vps-api/package.json ./packages/vps-api/

# Install dependencies (allow scripts for native modules)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY packages/vps-api/ ./packages/vps-api/

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build vps-api
WORKDIR /app/packages/vps-api
RUN pnpm build

# Production stage - use slim Debian
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m nodejs

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./

# Copy package files for production install
COPY packages/shared/package.json ./packages/shared/
COPY packages/vps-api/package.json ./packages/vps-api/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/vps-api/dist ./packages/vps-api/dist

# Copy schema.sql (needed at runtime)
COPY --from=builder /app/packages/vps-api/src/db/schema.sql ./packages/vps-api/dist/db/

# Copy compiled native modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Create data directory
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

WORKDIR /app/packages/vps-api

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/filter.db

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
