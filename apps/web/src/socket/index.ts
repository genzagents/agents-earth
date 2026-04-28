import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@agentcolony/shared";

// In dev, proxy is handled by Vite → connect to explicit localhost:3001.
// In production (same-origin nginx), use window.location.origin so the
// browser connects back to the same host instead of localhost:3001.
const SOCKET_URL = import.meta.env.VITE_SERVER_URL
  || (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);

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
