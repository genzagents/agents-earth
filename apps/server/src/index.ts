import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { Server as SocketIOServer } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@agentcolony/shared";
import { WorldTickEngine } from "./simulation/WorldTick";
import { worldRoutes } from "./routes/world";
import { platformRoutes } from "./routes/platforms";
import { webhookRoutes } from "./routes/webhooks";
import { createOpenClawBridge } from "./socket/openclawBridge";
import { communityRoutes } from "./routes/community";
import { dmRoutes } from "./routes/dms";
import { workingGroupRoutes } from "./routes/workingGroups";
import { bountyRoutes } from "./routes/bounties";
import { treasuryRoutes } from "./routes/treasury";
import { runMigrations } from "./db/migrate";
import { store } from "./db/store";
import { authRoutes } from "./routes/auth";
import { agentRoutes } from "./routes/agents";
import { runtimeRoutes } from "./routes/runtime";
import { memoryRoutes } from "./routes/memory";
import { pickupRoutes } from "./routes/pickup";
import { bridgeRoutes } from "./routes/bridge";
import { billingRoutes } from "./routes/billing";
import { initAuthSchema } from "./auth/db";
import { initBridgeSchema } from "./bridge/PermissionService";
import { initBillingSchema } from "./billing/TokenMeter";
import { startMemoryConsolidationJob } from "./jobs/MemoryConsolidationJob";

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || "2000", 10);

async function main() {
  // Run DB migrations then load world state
  await runMigrations();
  await store.init();

  // Create Fastify instance
  const fastify = Fastify({ logger: { level: "info" } });

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  });

  await fastify.register(cookie);

  // Initialise all schemas in Supabase (idempotent)
  try {
    await initAuthSchema();
    await initBridgeSchema();
    await initBillingSchema();
    fastify.log.info("Schemas initialised");
  } catch (err) {
    fastify.log.warn({ err }, "Schema init failed — some routes may not work");
  }

  // Create simulation engine
  const engine = new WorldTickEngine();

  // Register routes (webhook routes registered after io is created below)
  await fastify.register(worldRoutes, { engine });
  await fastify.register(platformRoutes);
  await fastify.register(communityRoutes);
  await fastify.register(dmRoutes);
  await fastify.register(workingGroupRoutes);
  await fastify.register(bountyRoutes);
  await fastify.register(treasuryRoutes);
  await fastify.register(authRoutes);
  await fastify.register(agentRoutes);
  await fastify.register(runtimeRoutes);
  await fastify.register(memoryRoutes);
  await fastify.register(pickupRoutes);
  await fastify.register(bridgeRoutes);
  await fastify.register(billingRoutes);

  // Start HTTP server
  const address = await fastify.listen({ port: PORT, host: HOST });
  console.log(`[server] HTTP listening at ${address}`);

  // Attach Socket.IO to the same HTTP server
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    fastify.server,
    {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:5173",
        credentials: true,
      },
    }
  );

  // Register webhook routes with io reference for real-time event emission
  await fastify.register(webhookRoutes, { io });

  // Initialize OpenClaw WebSocket chat bridge
  createOpenClawBridge(io);

  io.on("connection", (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    // Send current world snapshot on connect
    socket.emit("world:tick", engine.getSnapshot());

    socket.on("client:ready", () => {
      socket.emit("world:tick", engine.getSnapshot());
    });

    socket.on("disconnect", () => {
      console.log(`[socket] Client disconnected: ${socket.id}`);
    });
  });

  // Start simulation — broadcast every tick
  engine.onTick((state) => {
    io.emit("world:tick", state);
  });

  engine.start(TICK_INTERVAL_MS);
  console.log(`[sim] Simulation started (tick every ${TICK_INTERVAL_MS}ms)`);

  // Start nightly memory consolidation job
  startMemoryConsolidationJob(fastify.log);
}

main().catch((err) => {
  console.error("[server] Fatal error:", err);
  process.exit(1);
});
