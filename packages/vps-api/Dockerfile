# Single stage build with Debian 11 (bullseye) to match VPS
FROM node:20-bullseye-slim

WORKDIR /app

# Replace apt sources
RUN echo "deb http://deb.debian.org/debian bullseye main contrib non-free" > /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bullseye-updates main contrib non-free" >> /etc/apt/sources.list && \
    echo "deb http://security.debian.org/debian-security bullseye-security main contrib non-free" >> /etc/apt/sources.list

# Install build tools for native modules
RUN apt-get update
RUN apt-get install -y --no-install-recommends python3 build-essential wget
RUN rm -rf /var/lib/apt/lists/*

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

USER node
WORKDIR /app/packages/vps-api

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/filter.db

EXPOSE 3000

CMD ["node", "dist/index.js"]
