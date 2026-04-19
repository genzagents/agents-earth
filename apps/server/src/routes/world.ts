import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance } from "fastify";
import { store } from "../db/store";
import type { WorldTickEngine } from "../simulation/WorldTick";
import type { Agent, AgentTrait, ActivityType } from "@agentcolony/shared";
import { agentBrain } from "../simulation/AgentBrain";
import { vectorMemory } from "../services/VectorMemoryService";

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

  // ── Semantic memory search ─────────────────────────────────────────────────

  // GET /api/agents/:id/memories/search?q=<query>&limit=<n>
  // Uses Pinecone vector similarity search when configured; falls back to
  // in-memory substring match when PINECONE_API_KEY is not set.
  fastify.get<{
    Params: { id: string };
    Querystring: { q?: string; limit?: string };
  }>("/api/agents/:id/memories/search", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const q = req.query.q?.trim() ?? "";
    if (!q) return reply.code(400).send({ error: "Query parameter 'q' is required" });

    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? "10", 10) || 10));
    const agentMemories = store.getAgentMemories(req.params.id);

    // Vector path
    if (vectorMemory.isEnabled) {
      const ids = await vectorMemory.search(req.params.id, q, limit);
      if (ids.length > 0) {
        const idSet = new Set(ids);
        const results = agentMemories.filter(m => idSet.has(m.id));
        // Preserve the vector similarity order
        const ordered = ids.map(id => results.find(m => m.id === id)).filter(Boolean);
        return ordered;
      }
    }

    // Fallback: substring match
    const lower = q.toLowerCase();
    return agentMemories
      .filter(m => m.description.toLowerCase().includes(lower))
      .slice(0, limit);
  });
}
