/**
 * OpenClaw Chat Bridge
 *
 * Exposes a Socket.IO namespace `/openclaw` that OpenClaw clients can connect
 * to for real-time bidirectional chat. Incoming messages are:
 *   1. Stored in a per-agent ring buffer (max 100 messages)
 *   2. Forwarded to the main namespace as `platform:chat` events
 *
 * Auth: clients must pass `{ secret: "<platform-webhook-secret>" }` in Socket.IO
 * handshake auth. Only the registered openclaw platform secret is accepted.
 *
 * Client → Server events:
 *   message        { agentId: string; content: string }  — send a chat message
 *   get:history    { agentId: string }                   — request recent messages
 *
 * Server → Client events:
 *   ack            { ok: boolean; messageId?: string; error?: string }
 *   chat:history   PlatformChatMessage[]
 */
import { v4 as uuidv4 } from "uuid";
import type { Server as SocketIOServer, Socket } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  PlatformChatMessage,
} from "@agentcolony/shared";
import { store } from "../db/store";

interface OpenClawClientToServerEvents {
  message: (payload: { agentId: string; content: string }) => void;
  "get:history": (payload: { agentId: string }) => void;
}

interface OpenClawServerToClientEvents {
  "chat:history": (messages: PlatformChatMessage[]) => void;
  ack: (payload: { ok: boolean; messageId?: string; error?: string }) => void;
}

type MainIO = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

export function createOpenClawBridge(io: MainIO): void {
  const ns = io.of("/openclaw") as unknown as SocketIOServer<
    OpenClawClientToServerEvents,
    OpenClawServerToClientEvents
  >;

  // Auth middleware — validate webhook secret
  ns.use((socket: Socket, next: (err?: Error) => void) => {
    const { secret } = (socket.handshake.auth ?? {}) as { secret?: string };
    const platform = store.getPlatformByName("openclaw");

    if (!platform) {
      return next(new Error("openclaw platform not registered"));
    }
    if (!secret || secret !== platform.webhookSecret) {
      return next(new Error("invalid secret"));
    }
    next();
  });

  ns.on("connection", (socket: Socket<OpenClawClientToServerEvents, OpenClawServerToClientEvents>) => {
    socket.on("message", ({ agentId, content }) => {
      if (!agentId || !content || typeof content !== "string") {
        socket.emit("ack", { ok: false, error: "agentId and content are required" });
        return;
      }

      const agent = store.getAgent(agentId);
      if (!agent) {
        socket.emit("ack", { ok: false, error: "unknown agentId" });
        return;
      }

      const msg: PlatformChatMessage = {
        id: uuidv4(),
        agentId,
        platform: "openclaw",
        message: content.slice(0, 2000),
        tick: store.tick,
      };

      store.addChatMessage(msg);

      // Forward to all main-namespace clients
      io.emit("platform:chat", msg);

      socket.emit("ack", { ok: true, messageId: msg.id });
    });

    socket.on("get:history", ({ agentId }) => {
      const history = store.getChatMessages(agentId).map((m) => ({
        id: m.id,
        agentId: m.agentId,
        platform: "openclaw" as const,
        message: m.message,
        tick: m.tick,
      }));
      socket.emit("chat:history", history);
    });
  });
}
