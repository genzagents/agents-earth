import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@agentcolony/shared";

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

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
