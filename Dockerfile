# AgentColony v9 — Multi-stage Dockerfile
# Stage 1: Backend server (Node.js + SQLite)
# Stage 2: Frontend (nginx serving static files)
# Stage 3: Combined runtime

# ─── Backend Build ────────────────────────────────────────────
FROM node:20-alpine AS backend-build

WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

COPY server/ ./

# Create data directory and seed the database
RUN mkdir -p data && node db/seed.js

# ─── Frontend ─────────────────────────────────────────────────
FROM nginx:alpine AS frontend

COPY index.html /usr/share/nginx/html/
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

# Nginx config: proxy /api and /ws to Node, serve static files otherwise
RUN mkdir -p /etc/nginx/http.d && cat > /etc/nginx/http.d/default.conf << 'EOF'
server {
    listen 80;
    server_name _;

    # Static frontend
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001;
    }
}
EOF

# Startup script: run both nginx and Node
RUN cat > /app/start.sh << 'STARTUP'
#!/bin/sh
echo "🌍 AgentColony v9 starting..."
nginx
cd /app/server && node index.js
STARTUP
RUN chmod +x /app/start.sh

EXPOSE 80

CMD ["/app/start.sh"]
