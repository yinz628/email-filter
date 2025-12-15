# Single stage build with Debian to ensure native modules work
FROM node:20-bookworm-slim

WORKDIR /app

# Install build tools for native modules
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy package.json files
COPY packages/shared/package.json ./packages/shared/
COPY packages/vps-api/package.json ./packages/vps-api/

# Install dependencies (this will compile better-sqlite3)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/vps-api/ ./packages/vps-api/

# Build shared first, then vps-api
RUN pnpm --filter @email-filter/shared build && \
    pnpm --filter @email-filter/vps-api build

# Copy schema.sql to dist
RUN cp packages/vps-api/src/db/schema.sql packages/vps-api/dist/db/

# Create data directory
RUN mkdir -p /app/data && chown -R node:node /app/data

# Clean up build tools to reduce image size (optional, keeps native modules)
RUN apt-get purge -y python3 build-essential && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /app/packages/vps-api

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/filter.db

EXPOSE 3000

CMD ["node", "dist/index.js"]
