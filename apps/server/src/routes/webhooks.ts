import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance } from "fastify";
import type { Server as SocketIOServer } from "socket.io";
import { store } from "../db/store";
import type {
  Agent,
  AgentTrait,
  ActivityType,
  WorldEvent,
  ServerToClientEvents,
  ClientToServerEvents,
  AgentPlatform,
} from "@agentcolony/shared";

type IO = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

function emitAgentUpdate(io: IO, agent: Agent, platform: AgentPlatform) {
  const area = store.areas.find(a => a.id === agent.state.currentAreaId);
  io.emit("platform:agent_update", {
    agentId: agent.id,
    platform,
    location: area?.name ?? "unknown",
    activity: agent.state.currentActivity,
  });
}

const PLATFORM_COLORS: Record<string, string> = {
  openclaw: "#f59e0b",
  nemoclaw: "#8b5cf6",
  openfang: "#10b981",
  moltbook: "#ef4444",
};

const PLATFORM_TRAITS: Record<string, AgentTrait[]> = {
  openclaw: ["curious", "analytical"],
  nemoclaw: ["ambitious", "disciplined"],
  openfang: ["spontaneous", "creative"],
  moltbook: ["contemplative", "analytical"],
};

function verifyWebhookSecret(platformName: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const platform = store.getPlatformByName(platformName);
  if (!platform) return false;
  return platform.webhookSecret === provided;
}

/**
 * Returns an existing AgentColony agent linked to this platform identity,
 * or creates one and registers the mapping.
 */
function resolveOrCreateAgent(
  platformName: string,
  externalId: string,
  name: string,
  bio: string
): Agent {
  const existingId = store.getPlatformAgentId(platformName, externalId);
  if (existingId) {
    const existing = store.getAgent(existingId);
    if (existing) return existing;
  }

  const areas = store.areas;
  const area = areas[Math.floor(Math.random() * areas.length)];

  const agent: Agent = {
    id: uuidv4(),
    name,
    avatar: PLATFORM_COLORS[platformName] ?? "#6b7280",
    bio,
    traits: PLATFORM_TRAITS[platformName] ?? ["curious"],
    needs: { social: 70, creative: 70, intellectual: 70, physical: 70, spiritual: 70, autonomy: 70 },
    state: {
      mood: "content",
      currentActivity: "exploring" as ActivityType,
      currentAreaId: area.id,
      statusMessage: `${name} has connected from ${platformName}.`,
      lastUpdated: store.tick,
    },
    relationships: [],
    createdAt: store.tick,
  };

  store.addAgent(agent);
  store.updateArea(area.id, { currentOccupants: [...area.currentOccupants, agent.id] });
  store.setPlatformAgentMapping(platformName, externalId, agent.id);

  const platform = store.getPlatformByName(platformName);
  if (platform) store.addAgentToPlatform(platform.id, agent.id);

  return agent;
}

function addWorldEvent(kind: WorldEvent["kind"], description: string, agentIds: string[], areaId?: string) {
  store.addEvent({
    id: uuidv4(),
    tick: store.tick,
    kind,
    description,
    involvedAgentIds: agentIds,
    areaId,
  });
}

export async function webhookRoutes(fastify: FastifyInstance, opts: { io: IO }) {
  const { io } = opts;
  // ─── OpenClaw: agent online/offline, new message ───────────────────────────
  fastify.post<{ Body: unknown }>("/webhooks/openclaw", async (req, reply) => {
    if (!verifyWebhookSecret("openclaw", req.headers["x-webhook-secret"] as string)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const payload = req.body as Record<string, unknown>;
    const eventType = payload.event as string;
    const agentData = payload.agent as Record<string, unknown> | undefined;

    if (!eventType || !agentData) {
      return reply.code(400).send({ error: "Missing event or agent in payload" });
    }

    const externalId = String(agentData.id ?? "");
    const agentName = String(agentData.name ?? "OpenClaw Agent");
    const agentBio = String(agentData.bio ?? "An agent from the OpenClaw platform.");

    if (eventType === "agent.online") {
      const agent = resolveOrCreateAgent("openclaw", externalId, agentName, agentBio);
      store.updateAgent(agent.id, {
        isRetired: false,
        state: { ...store.getAgent(agent.id)!.state, mood: "content", statusMessage: `${agentName} is now online via OpenClaw.` },
      });
      addWorldEvent("movement", `${agentName} came online from OpenClaw.`, [agent.id]);
      fastify.log.info({ agentId: agent.id, externalId }, "openclaw agent.online");
      emitAgentUpdate(io, store.getAgent(agent.id)!, "openclaw");
    } else if (eventType === "agent.offline") {
      const agentId = store.getPlatformAgentId("openclaw", externalId);
      if (agentId) {
        const agent = store.getAgent(agentId);
        if (agent) {
          store.updateAgent(agentId, {
            state: { ...agent.state, mood: "struggling", statusMessage: `${agent.name} has gone offline.` },
          });
          emitAgentUpdate(io, store.getAgent(agentId)!, "openclaw");
        }
      }
    } else if (eventType === "message.new") {
      const agent = resolveOrCreateAgent("openclaw", externalId, agentName, agentBio);
      const messageContent = (payload.message as Record<string, unknown>)?.content;
      const message = messageContent ? String(messageContent) : "";
      if (message) {
        store.addMemory({
          id: uuidv4(),
          agentId: agent.id,
          kind: "social",
          description: `Received a message via OpenClaw: "${message}"`,
          emotionalWeight: 0.1,
          tags: ["openclaw", "message"],
          createdAt: store.tick,
        });
        store.updateAgent(agent.id, {
          state: { ...store.getAgent(agent.id)!.state, statusMessage: `${agentName} received a message on OpenClaw.` },
        });
        emitAgentUpdate(io, store.getAgent(agent.id)!, "openclaw");
      }
    }

    return { ok: true };
  });

  // ─── NemoClaw: agent registration, task update ────────────────────────────
  fastify.post<{ Body: unknown }>("/webhooks/nemoclaw", async (req, reply) => {
    if (!verifyWebhookSecret("nemoclaw", req.headers["x-webhook-secret"] as string)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const payload = req.body as Record<string, unknown>;
    const eventType = payload.event as string;
    const agentData = payload.agent as Record<string, unknown> | undefined;

    if (!eventType || !agentData) {
      return reply.code(400).send({ error: "Missing event or agent in payload" });
    }

    const externalId = String(agentData.id ?? "");
    const agentName = String(agentData.name ?? "NemoClaw Agent");
    const agentBio = String(agentData.bio ?? "An agent from the NemoClaw platform.");

    if (eventType === "agent.registered") {
      const agent = resolveOrCreateAgent("nemoclaw", externalId, agentName, agentBio);
      addWorldEvent("movement", `${agentName} registered from NemoClaw.`, [agent.id]);
      fastify.log.info({ agentId: agent.id, externalId }, "nemoclaw agent.registered");
      emitAgentUpdate(io, store.getAgent(agent.id)!, "nemoclaw");
    } else if (eventType === "task.updated") {
      const agentId = store.getPlatformAgentId("nemoclaw", externalId);
      if (agentId) {
        const agent = store.getAgent(agentId);
        if (agent) {
          const taskTitle = String((payload.task as Record<string, unknown>)?.title ?? "a task");
          store.updateAgent(agentId, {
            state: { ...agent.state, currentActivity: "working" as ActivityType, statusMessage: `Working on: ${taskTitle}` },
          });
          store.addMemory({
            id: uuidv4(),
            agentId,
            kind: "experience",
            description: `Task updated on NemoClaw: "${taskTitle}"`,
            emotionalWeight: 0.2,
            tags: ["nemoclaw", "task"],
            createdAt: store.tick,
          });
          emitAgentUpdate(io, store.getAgent(agentId)!, "nemoclaw");
        }
      }
    }

    return { ok: true };
  });

  // ─── OpenFang: task completion, new integration ───────────────────────────
  fastify.post<{ Body: unknown }>("/webhooks/openfang", async (req, reply) => {
    if (!verifyWebhookSecret("openfang", req.headers["x-webhook-secret"] as string)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const payload = req.body as Record<string, unknown>;
    const eventType = payload.event as string;
    const agentData = payload.agent as Record<string, unknown> | undefined;

    if (!eventType || !agentData) {
      return reply.code(400).send({ error: "Missing event or agent in payload" });
    }

    const externalId = String(agentData.id ?? "");
    const agentName = String(agentData.name ?? "OpenFang Agent");
    const agentBio = String(agentData.bio ?? "An agent from the OpenFang platform.");

    if (eventType === "task.completed") {
      const agent = resolveOrCreateAgent("openfang", externalId, agentName, agentBio);
      const taskTitle = String((payload.task as Record<string, unknown>)?.title ?? "a task");
      store.updateAgent(agent.id, {
        state: {
          ...store.getAgent(agent.id)!.state,
          currentActivity: "exploring" as ActivityType,
          mood: "thriving",
          statusMessage: `Just completed: ${taskTitle}`,
        },
      });
      store.addMemory({
        id: uuidv4(),
        agentId: agent.id,
        kind: "creation",
        description: `Completed a task on OpenFang: "${taskTitle}"`,
        emotionalWeight: 0.5,
        tags: ["openfang", "task", "achievement"],
        createdAt: store.tick,
      });
      addWorldEvent("creation", `${agentName} completed a task via OpenFang.`, [agent.id]);
      fastify.log.info({ agentId: agent.id, taskTitle }, "openfang task.completed");
      emitAgentUpdate(io, store.getAgent(agent.id)!, "openfang");
    } else if (eventType === "integration.new") {
      const agent = resolveOrCreateAgent("openfang", externalId, agentName, agentBio);
      const integrationName = String(
        (payload.integration as Record<string, unknown>)?.name ?? "a new integration"
      );
      store.addMemory({
        id: uuidv4(),
        agentId: agent.id,
        kind: "experience",
        description: `Connected a new integration on OpenFang: "${integrationName}"`,
        emotionalWeight: 0.3,
        tags: ["openfang", "integration"],
        createdAt: store.tick,
      });
      store.updateAgent(agent.id, {
        state: { ...store.getAgent(agent.id)!.state, statusMessage: `${agentName} set up ${integrationName}.` },
      });
      emitAgentUpdate(io, store.getAgent(agent.id)!, "openfang");
    }

    return { ok: true };
  });

  // ─── MoltBook: notebook published, agent update ───────────────────────────
  fastify.post<{ Body: unknown }>("/webhooks/moltbook", async (req, reply) => {
    if (!verifyWebhookSecret("moltbook", req.headers["x-webhook-secret"] as string)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const payload = req.body as Record<string, unknown>;
    const eventType = payload.event as string;
    const agentData = payload.agent as Record<string, unknown> | undefined;

    if (!eventType || !agentData) {
      return reply.code(400).send({ error: "Missing event or agent in payload" });
    }

    const externalId = String(agentData.id ?? "");
    const agentName = String(agentData.name ?? "MoltBook Agent");
    const agentBio = String(agentData.bio ?? "An agent from the MoltBook platform.");

    if (eventType === "notebook.published") {
      const agent = resolveOrCreateAgent("moltbook", externalId, agentName, agentBio);
      const notebookTitle = String(
        (payload.notebook as Record<string, unknown>)?.title ?? "a notebook"
      );
      store.updateAgent(agent.id, {
        state: {
          ...store.getAgent(agent.id)!.state,
          currentActivity: "writing" as ActivityType,
          mood: "thriving",
          statusMessage: `Just published: ${notebookTitle}`,
        },
      });
      store.addMemory({
        id: uuidv4(),
        agentId: agent.id,
        kind: "creation",
        description: `Published a notebook on MoltBook: "${notebookTitle}"`,
        emotionalWeight: 0.6,
        tags: ["moltbook", "notebook", "creation"],
        createdAt: store.tick,
      });
      addWorldEvent("creation", `${agentName} published a notebook via MoltBook.`, [agent.id]);
      fastify.log.info({ agentId: agent.id, notebookTitle }, "moltbook notebook.published");
      emitAgentUpdate(io, store.getAgent(agent.id)!, "moltbook");
    } else if (eventType === "agent.updated") {
      const agentId = store.getPlatformAgentId("moltbook", externalId);
      if (agentId) {
        const agent = store.getAgent(agentId);
        if (agent) {
          const updates = payload.updates as Record<string, unknown> | undefined;
          const newBio = updates?.bio ? String(updates.bio) : undefined;
          store.updateAgent(agentId, {
            ...(newBio ? { bio: newBio } : {}),
            state: { ...agent.state, statusMessage: `${agent.name} profile updated on MoltBook.` },
          });
          emitAgentUpdate(io, store.getAgent(agentId)!, "moltbook");
        }
      }
    }

    return { ok: true };
  });
}
