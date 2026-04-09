import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@agentcolony/shared";

// In production nginx proxies /socket.io/ to Fastify on 3001, so same-origin is correct.
// Set VITE_SERVER_URL only for local dev where frontend (5173) and backend (3001) differ.
const SOCKET_URL = import.meta.env.VITE_SERVER_URL ?? "";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SOCKET_URL, {
  autoConnect: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export function connectSocket() {
  if (!socket.connected) {
    socket.connect();
  }
}
