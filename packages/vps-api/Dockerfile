# Build stage - use npm instead of pnpm for better native module support
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/vps-api/package.json ./packages/vps-api/

# Copy source
COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/vps-api/ ./packages/vps-api/

# Install and build shared
WORKDIR /app/packages/shared
RUN npm install
RUN npm run build

# Install and build vps-api
WORKDIR /app/packages/vps-api
RUN npm install
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built shared
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

# Copy built vps-api
COPY --from=builder /app/packages/vps-api/dist ./packages/vps-api/dist
COPY --from=builder /app/packages/vps-api/package.json ./packages/vps-api/
COPY --from=builder /app/packages/vps-api/node_modules ./packages/vps-api/node_modules
COPY --from=builder /app/packages/vps-api/src/db/schema.sql ./packages/vps-api/dist/db/

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
