#!/bin/sh
echo "AgentColony v10 starting (TypeScript/React/Fastify)..."
nginx
exec node /app/apps/server/dist/index.js
