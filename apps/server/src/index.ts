import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@agentcolony/shared";
import { WorldTickEngine } from "./simulation/WorldTick";
import { worldRoutes } from "./routes/world";
import { platformRoutes } from "./routes/platforms";
import { webhookRoutes } from "./routes/webhooks";

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || "2000", 10);

async function main() {
  // Create Fastify instance
  const fastify = Fastify({ logger: { level: "info" } });

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  });

  // Create simulation engine
  const engine = new WorldTickEngine();

  // Register routes
  await fastify.register(worldRoutes, { engine });
  await fastify.register(platformRoutes);
  await fastify.register(webhookRoutes);

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
}

main().catch((err) => {
  console.error("[server] Fatal error:", err);
  process.exit(1);
});
