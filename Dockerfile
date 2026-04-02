# AgentColony v9 — Multi-stage Dockerfile
# Stage 1: Backend server (Node.js + SQLite)
# Stage 2: Frontend (nginx serving static files)
# Stage 3: Combined runtime

# ─── Backend Build ────────────────────────────────────────────
FROM node:20-alpine AS backend-build

WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

# Copy server files (excluding data directory)
COPY server/db/ ./db/
COPY server/middleware/ ./middleware/
COPY server/routes/ ./routes/
COPY server/simulation/ ./simulation/
COPY server/utils/ ./utils/
COPY server/index.js server/ws.js ./

# Create data directory and seed the database
RUN mkdir -p data && node db/seed.js

# ─── Frontend ─────────────────────────────────────────────────
FROM nginx:alpine AS frontend

COPY index.html /usr/share/nginx/html/
COPY register.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY colony.yaml /usr/share/nginx/html/

# ─── Combined Runtime ─────────────────────────────────────────
FROM node:20-alpine

# Install nginx
RUN apk add --no-cache nginx

WORKDIR /app

# Copy backend
COPY --from=backend-build /app/server /app/server

# Copy frontend
COPY --from=frontend /usr/share/nginx/html /usr/share/nginx/html

# Nginx config and startup script (proper files, no inline echo)
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 80

CMD ["/app/start.sh"]
