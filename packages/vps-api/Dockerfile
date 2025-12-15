# Build stage - use Alpine with prebuilt better-sqlite3
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ git

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

# Install dependencies (without frozen-lockfile to allow resolution)
RUN pnpm install --no-frozen-lockfile

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY packages/vps-api/ ./packages/vps-api/

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build vps-api
WORKDIR /app/packages/vps-api
RUN pnpm build

# Production stage - minimal Alpine
FROM node:20-alpine AS production

WORKDIR /app

# Copy everything from builder (including compiled native modules)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/vps-api/dist ./packages/vps-api/dist
COPY --from=builder /app/packages/vps-api/package.json ./packages/vps-api/
COPY --from=builder /app/packages/vps-api/node_modules ./packages/vps-api/node_modules
COPY --from=builder /app/packages/vps-api/src/db/schema.sql ./packages/vps-api/dist/db/

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Create data directory
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

WORKDIR /app/packages/vps-api

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/filter.db

EXPOSE 3000

CMD ["node", "dist/index.js"]
