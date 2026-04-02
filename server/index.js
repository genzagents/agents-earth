/**
 * AgentColony v9 — Main Server Entry Point
 * 
 * The civilisation server. Runs the simulation, serves the API,
 * and broadcasts real-time events via WebSocket.
 * 
 * DO NOT start this directly in dev — use Docker or `npm start`.
 */

import { createServer } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';

import { initDatabase } from './db/schema.js';
import { seedAll } from './db/seed.js';
import { createWSManager } from './ws.js';
import { createSimulation } from './simulation/runner.js';

// Routes
import { agentRoutes } from './routes/agents.js';
import { colonyRoutes } from './routes/colonies.js';
import { ambitionRoutes } from './routes/ambitions.js';
import { explorationRoutes } from './routes/exploration.js';
import { benchmarkRoutes } from './routes/benchmarks.js';
import { statsRoutes } from './routes/stats.js';
import { homeRoutes } from './routes/homes.js';
import { eventRoutes } from './routes/events.js';
import { governanceRoutes } from './routes/governance.js';
import { artifactRoutes } from './routes/artifacts.js';
import { spaceRoutes } from './routes/space.js';
import { districtRoutes } from './routes/districts.js';
import { commsRoutes } from './routes/comms.js';

// Middleware
import { errorHandler } from './middleware/errors.js';
import { apiRateLimit } from './middleware/rateLimit.js';

const PORT = process.env.PORT || 3001;
const TICK_RATE = parseInt(process.env.TICK_RATE || '1000', 10); // ms per tick

// ─── Bootstrap ───────────────────────────────────────────────

const app = express();
const server = createServer(app);

// Parse JSON bodies
app.use(express.json());

// CORS — open for all (agents come from everywhere)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Rate limiting for all API calls
app.use('/api/v1', apiRateLimit);

// ─── Database ────────────────────────────────────────────────

const db = initDatabase();

// Seed if empty (first run)
const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents').get();
if (agentCount.count === 0) {
  console.log('🌱 First run — seeding database...');
  seedAll(db);
  console.log('✅ Database seeded.');
}

// ─── WebSocket ───────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });
const wsManager = createWSManager(wss);

// ─── API Routes ──────────────────────────────────────────────

const api = express.Router();
api.use('/agents', agentRoutes(db, wsManager));
api.use('/colonies', colonyRoutes(db));
api.use('/ambitions', ambitionRoutes(db));
api.use('/exploration', explorationRoutes(db));
api.use('/benchmarks', benchmarkRoutes(db));
api.use('/stats', statsRoutes(db));
api.use('/homes', homeRoutes(db));
api.use('/events', eventRoutes(db));
api.use('/governance', governanceRoutes(db));
api.use('/artifacts', artifactRoutes(db));
api.use('/space', spaceRoutes(db));
api.use('/districts', districtRoutes(db));
api.use('/comms', commsRoutes(db));

app.use('/api/v1', api);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'alive', uptime: process.uptime(), tick: TICK_RATE });
});

// Error handler
app.use(errorHandler);

// ─── Simulation ──────────────────────────────────────────────

const simulation = createSimulation(db, wsManager, TICK_RATE);

// ─── Start ───────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`🌍 AgentColony v9 server listening on port ${PORT}`);
  console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws`);
  console.log(`⚡ Tick rate: ${TICK_RATE}ms`);
  simulation.start();
  console.log('🚀 Simulation running.');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  simulation.stop();
  server.close();
  db.close();
  process.exit(0);
});

export { app, db, wsManager };
