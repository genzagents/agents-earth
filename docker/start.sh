#!/bin/sh
echo "🌍 AgentColony v9 starting..."
nginx
cd /app/server && exec node index.js
