# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.json ./

# Copy package files
COPY packages/shared/package.json ./packages/shared/
COPY packages/vps-admin/package.json ./packages/vps-admin/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY packages/vps-admin/ ./packages/vps-admin/

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build vps-admin
WORKDIR /app/packages/vps-admin
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./

# Copy package files for production install
COPY packages/shared/package.json ./packages/shared/
COPY packages/vps-admin/package.json ./packages/vps-admin/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/vps-admin/dist ./packages/vps-admin/dist

# Copy schema.sql (needed at runtime)
COPY --from=builder /app/packages/vps-admin/src/db/schema.sql ./packages/vps-admin/dist/db/

# Create data directory
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

WORKDIR /app/packages/vps-admin

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV ADMIN_DB_PATH=/app/data/admin.db

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
