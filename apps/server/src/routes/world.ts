import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance } from "fastify";
import { store } from "../db/store";
import type { WorldTickEngine } from "../simulation/WorldTick";
import type { Agent, AgentTrait, ActivityType } from "@agentcolony/shared";
import { agentBrain } from "../simulation/AgentBrain";

// Rate limit: max 10 chat messages per agent per minute
const chatRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkChatRateLimit(agentId: string): boolean {
  const now = Date.now();
  const entry = chatRateLimit.get(agentId);
  if (!entry || now >= entry.resetAt) {
    chatRateLimit.set(agentId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

interface CreateAgentBody {
  name: string;
  bio: string;
  avatar: string;
  traits: AgentTrait[];
  startingAreaId?: string;
}

export async function worldRoutes(fastify: FastifyInstance, opts: { engine: WorldTickEngine }) {
  const { engine } = opts;

  fastify.get("/api/world", async () => {
    return engine.getSnapshot();
  });

  fastify.get("/api/agents", async () => {
    return store.agents.map(a => ({
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      mood: a.state.mood,
      currentActivity: a.state.currentActivity,
      statusMessage: a.state.statusMessage,
      currentAreaId: a.state.currentAreaId,
      isRetired: a.isRetired ?? false,
    }));
  });

  fastify.get<{ Params: { id: string } }>("/api/agents/:id", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    return agent;
  });

  fastify.get<{ Params: { id: string } }>("/api/agents/:id/memories", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    return store.getAgentMemories(req.params.id);
  });

  fastify.get<{ Params: { id: string } }>("/api/agents/:id/relationships", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const relationships = store.getAgentRelationships(req.params.id);

    // Enrich with target agent name for convenience
    return relationships.map(rel => {
      const target = store.getAgent(rel.agentId);
      return {
        ...rel,
        targetName: target?.name ?? "Unknown",
        targetAvatar: target?.avatar ?? "",
      };
    });
  });

  fastify.post<{ Body: CreateAgentBody }>("/api/agents", {
    schema: {
      body: {
        type: "object",
        required: ["name", "bio", "avatar", "traits"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 500 },
          avatar: { type: "string" },
          traits: { type: "array", items: { type: "string" }, maxItems: 5 },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { name, bio, avatar, traits, startingAreaId } = req.body;

    const areas = store.areas;
    const area = startingAreaId
      ? areas.find(a => a.id === startingAreaId)
      : areas[Math.floor(Math.random() * areas.length)];

    if (!area) return reply.code(400).send({ error: "Invalid startingAreaId" });

    const newAgent: Agent = {
      id: uuidv4(),
      name,
      bio,
      avatar,
      traits,
      needs: { social: 75, creative: 75, intellectual: 75, physical: 75, spiritual: 75, autonomy: 75 },
      state: {
        mood: "content",
        currentActivity: "exploring" as ActivityType,
        currentAreaId: area.id,
        statusMessage: `${name} has just arrived in the city.`,
        lastUpdated: store.tick,
      },
      relationships: [],
      createdAt: store.tick,
    };

    store.addAgent(newAgent);

    // Add them to the area's occupants
    store.updateArea(area.id, {
      currentOccupants: [...area.currentOccupants, newAgent.id],
    });

    return reply.code(201).send(newAgent);
  });

  fastify.post<{ Params: { id: string }; Body: { message: string } }>("/api/agents/:id/chat", {
    schema: {
      body: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
  }, async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const { message } = req.body;

    if (!checkChatRateLimit(agent.id)) {
      return reply.code(429).send({ error: "Too many messages. Max 10 per minute per agent." });
    }

    let response: string | null;
    try {
      response = await agentBrain.chat(agent, store.getAgentMemories(agent.id), message);
    } catch {
      return reply.code(503).send({ error: "Agent brain unavailable. Please try again later." });
    }

    if (!response) {
      return reply.code(503).send({ error: "Agent brain unavailable. Please try again later." });
    }

    store.addMemory({
      id: uuidv4(),
      agentId: agent.id,
      kind: "social",
      description: `User asked: "${message}". ${agent.name} responded: "${response}"`,
      emotionalWeight: 0.2,
      tags: ["chat", "user"],
      createdAt: store.tick,
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      response,
      tick: store.tick,
    };
  });

  // ── GDPR: data export ────────────────────────────────────────────────────────
  // GET /api/agents/:id/gdpr/export
  // Returns a JSON archive of all data held for this agent.
  fastify.get<{ Params: { id: string } }>("/api/agents/:id/gdpr/export", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const memories = store.getAgentMemories(req.params.id);
    const relationships = store.getAgentRelationships(req.params.id);
    const events = store.getRecentEvents(200).filter(e => e.involvedAgentIds.includes(req.params.id));

    const archive = {
      exportedAt: new Date().toISOString(),
      exportVersion: "1.0",
      agent: {
        id: agent.id,
        name: agent.name,
        bio: agent.bio,
        traits: agent.traits,
        avatar: agent.avatar,
        needs: agent.needs,
        state: agent.state,
        createdAt: agent.createdAt,
        isRetired: agent.isRetired ?? false,
        legacyNote: agent.legacyNote,
        gdprDeleteRequestedAt: agent.gdprDeleteRequestedAt,
      },
      memories,
      relationships,
      events,
    };

    reply.header("Content-Disposition", `attachment; filename="gdpr-export-${agent.id}.json"`);
    reply.header("Content-Type", "application/json");
    return archive;
  });

  // ── GDPR: deletion request ───────────────────────────────────────────────────
  // POST /api/agents/:id/gdpr/erasure-request
  // Marks agent for deletion (30-day grace period). Agent is immediately retired.
  fastify.post<{ Params: { id: string } }>("/api/agents/:id/gdpr/erasure-request", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    if (agent.gdprDeleteRequestedAt !== undefined) {
      return reply.code(409).send({
        error: "Erasure already requested",
        requestedAt: agent.gdprDeleteRequestedAt,
      });
    }

    store.markGdprDeleteRequested(req.params.id);

    // 30-day grace period in ms (real-world wall clock, not sim ticks)
    const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
    const scheduledDeletionAt = new Date(Date.now() + GRACE_PERIOD_MS).toISOString();

    return reply.code(202).send({
      agentId: req.params.id,
      status: "erasure_requested",
      scheduledDeletionAt,
      message: "Agent data will be permanently deleted after the 30-day grace period. Use the cancellation endpoint to reverse this request within that window.",
    });
  });

  // POST /api/agents/:id/gdpr/erasure-cancel
  // Cancels a pending erasure request within the grace period.
  fastify.post<{ Params: { id: string } }>("/api/agents/:id/gdpr/erasure-cancel", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    if (agent.gdprDeleteRequestedAt === undefined) {
      return reply.code(409).send({ error: "No pending erasure request found for this agent" });
    }

    const cancelled = store.cancelGdprDeleteRequest(req.params.id);
    if (!cancelled) return reply.code(500).send({ error: "Failed to cancel erasure request" });

    return { agentId: req.params.id, status: "erasure_cancelled" };
  });

  // DELETE /api/agents/:id/gdpr
  // Immediately hard-deletes all data for this agent (bypasses grace period).
  // Intended for admin use or after grace period lapses.
  fastify.delete<{ Params: { id: string } }>("/api/agents/:id/gdpr", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const deleted = store.hardDeleteAgent(req.params.id);
    if (!deleted) return reply.code(500).send({ error: "Deletion failed" });

    return reply.code(200).send({
      agentId: req.params.id,
      status: "deleted",
      message: "All agent data has been permanently erased.",
    });
  });
}
