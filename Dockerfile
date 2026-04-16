# AgentColony v10 — TypeScript/React/Fastify Multi-stage Dockerfile
# Stage 1: Build (install deps + compile web + compile server)
# Stage 2: Runtime (nginx serving React SPA + Fastify API)

# ─── Builder ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/bridge-desktop/package.json ./apps/bridge-desktop/
COPY packages/shared/package.json ./packages/shared/
COPY packages/contracts/package.json ./packages/contracts/

# Install all dependencies (workspaces)
RUN npm install

# Copy all source files
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY tsconfig.json ./

# Build React frontend (Vite → dist/)
RUN npm run build --workspace=apps/web

# Build Fastify server (tsc → dist/)
RUN npm run build --workspace=apps/server

# ─── Runtime ──────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache nginx

WORKDIR /app

# Install only production server dependencies
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/bridge-desktop/package.json ./apps/bridge-desktop/
COPY packages/shared/package.json ./packages/shared/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm install --workspace=apps/server --omit=dev

# Copy compiled server (all @agentcolony/shared imports are type-only, erased at compile)
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Copy React SPA to nginx static root
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# nginx config and startup script
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 80

CMD ["/app/start.sh"]
