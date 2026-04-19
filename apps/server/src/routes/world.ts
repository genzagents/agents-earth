import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance } from "fastify";
import { store } from "../db/store";
import type { WorldTickEngine } from "../simulation/WorldTick";
import type { Agent, AgentTrait, ActivityType } from "@agentcolony/shared";
import { agentBrain } from "../simulation/AgentBrain";
import { agentRateLimiter, isAdminRequest, DEFAULT_REQUESTS_PER_MINUTE } from "../middleware/AgentRateLimiter";

interface CreateAgentBody {
  name: string;
  bio: string;
  avatar: string;
  traits: AgentTrait[];
  startingAreaId?: string;
}

export async function worldRoutes(fastify: FastifyInstance, opts: { engine: WorldTickEngine }) {
  const { engine } = opts;

  // ── Per-agent rate limiting (applies to all write routes below) ───────────
  // Enforced per-agent via agentRateLimiter. Admin requests (X-Admin-Secret) bypass.
  // Individual route handlers call agentRateLimiter.check(agentId, isAdmin).

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

    // Rate limit chat (respects per-agent config; admin bypass via X-Admin-Secret)
    const isAdmin = isAdminRequest(req.headers["x-admin-secret"] as string | undefined);
    const rl = agentRateLimiter.check(agent.id, isAdmin);
    if (!rl.allowed) {
      const retrySecs = Math.ceil(rl.retryAfterMs / 1000);
      reply.header("Retry-After", String(retrySecs));
      return reply.code(429).send({ error: "Rate limit exceeded", retryAfterMs: rl.retryAfterMs });
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

  // ── Rate limit management endpoints ───────────────────────────────────────

  // GET /api/agents/:id/rate-limit — get current rate limit config
  fastify.get<{ Params: { id: string } }>("/api/agents/:id/rate-limit", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    const config = agentRateLimiter.getConfig(agent.id);
    return {
      agentId: agent.id,
      requestsPerMinute: config.requestsPerMinute,
      trusted: config.trusted,
      effectiveLimit: config.trusted ? config.requestsPerMinute * 10 : config.requestsPerMinute,
      defaultLimit: DEFAULT_REQUESTS_PER_MINUTE,
    };
  });

  // PUT /api/agents/:id/rate-limit — update rate limit config (admin only)
  fastify.put<{
    Params: { id: string };
    Body: { requestsPerMinute?: number; trusted?: boolean };
  }>("/api/agents/:id/rate-limit", {
    schema: {
      body: {
        type: "object",
        properties: {
          requestsPerMinute: { type: "integer", minimum: 1, maximum: 10000 },
          trusted: { type: "boolean" },
        },
      },
    },
  }, async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const isAdmin = isAdminRequest(req.headers["x-admin-secret"] as string | undefined);
    if (!isAdmin) return reply.code(403).send({ error: "Admin secret required to modify rate limits" });

    const updated = agentRateLimiter.configure(agent.id, req.body);
    return { agentId: agent.id, ...updated };
  });

  // DELETE /api/agents/:id/rate-limit — reset to defaults (admin only)
  fastify.delete<{ Params: { id: string } }>("/api/agents/:id/rate-limit", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const isAdmin = isAdminRequest(req.headers["x-admin-secret"] as string | undefined);
    if (!isAdmin) return reply.code(403).send({ error: "Admin secret required" });

    agentRateLimiter.resetConfig(agent.id);
    return reply.code(200).send({
      agentId: agent.id,
      requestsPerMinute: DEFAULT_REQUESTS_PER_MINUTE,
      trusted: false,
      reset: true,
    });
  });
}
