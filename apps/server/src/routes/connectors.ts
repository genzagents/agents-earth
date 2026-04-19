import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance } from "fastify";
import { store } from "../db/store";
import type { Agent, AgentTrait, ActivityType } from "@agentcolony/shared";

const AVATAR_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
const DEFAULT_TRAITS: AgentTrait[] = ["curious", "creative", "analytical"];

function randomAvatar(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function deriveTraits(description: string): AgentTrait[] {
  const text = description.toLowerCase();
  const matches: AgentTrait[] = [];
  if (text.includes("creat") || text.includes("art") || text.includes("design")) matches.push("creative");
  if (text.includes("analyt") || text.includes("data") || text.includes("logic")) matches.push("analytical");
  if (text.includes("social") || text.includes("communic") || text.includes("collab")) matches.push("extroverted");
  if (text.includes("curious") || text.includes("learn") || text.includes("research")) matches.push("curious");
  if (text.includes("empat") || text.includes("kind") || text.includes("care")) matches.push("empathetic");
  if (text.includes("ambiti") || text.includes("goal") || text.includes("drive")) matches.push("ambitious");
  return matches.length > 0 ? matches.slice(0, 5) : DEFAULT_TRAITS;
}

export async function connectorRoutes(fastify: FastifyInstance) {
  // ── OpenClaw Connector ────────────────────────────────────────────────────

  // POST /api/connectors/openclaw/preview
  // Connects to an OpenClaw server and returns a list of importable agents.
  fastify.post<{
    Body: { serverUrl: string; apiKey?: string };
  }>("/api/connectors/openclaw/preview", {
    schema: {
      body: {
        type: "object",
        required: ["serverUrl"],
        properties: {
          serverUrl: { type: "string", minLength: 1 },
          apiKey: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { serverUrl, apiKey } = req.body;

    let baseUrl: string;
    try {
      const parsed = new URL(serverUrl);
      // Support ws:// → http://, wss:// → https://
      if (parsed.protocol === "ws:") parsed.protocol = "http:";
      else if (parsed.protocol === "wss:") parsed.protocol = "https:";
      baseUrl = parsed.origin;
    } catch {
      return reply.code(400).send({ error: "Invalid serverUrl" });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    let agents: unknown[];
    try {
      const res = await fetch(`${baseUrl}/api/agents`, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        return reply.code(502).send({ error: `OpenClaw server returned ${res.status}` });
      }
      const data = await res.json() as { agents?: unknown[] } | unknown[];
      agents = Array.isArray(data) ? data : (data as { agents?: unknown[] }).agents ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return reply.code(502).send({ error: `Could not reach OpenClaw server: ${msg}` });
    }

    const previews = (agents as Record<string, unknown>[]).map((a) => ({
      id: String(a.id ?? a.agentId ?? uuidv4()),
      name: String(a.name ?? "Unknown Agent"),
      bio: String(a.bio ?? a.description ?? ""),
      avatar: String(a.avatar ?? randomAvatar()),
      traits: Array.isArray(a.traits) ? (a.traits as AgentTrait[]).slice(0, 5) : deriveTraits(String(a.bio ?? a.description ?? "")),
      platform: "openclaw" as const,
    }));

    return { serverUrl: baseUrl, agents: previews };
  });

  // POST /api/connectors/openclaw/import
  // Fetches one agent from OpenClaw and creates them in the simulation.
  fastify.post<{
    Body: { serverUrl: string; apiKey?: string; agentId: string; startingAreaId?: string };
  }>("/api/connectors/openclaw/import", {
    schema: {
      body: {
        type: "object",
        required: ["serverUrl", "agentId"],
        properties: {
          serverUrl: { type: "string", minLength: 1 },
          apiKey: { type: "string" },
          agentId: { type: "string", minLength: 1 },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { serverUrl, apiKey, agentId, startingAreaId } = req.body;

    let baseUrl: string;
    try {
      const parsed = new URL(serverUrl);
      if (parsed.protocol === "ws:") parsed.protocol = "http:";
      else if (parsed.protocol === "wss:") parsed.protocol = "https:";
      baseUrl = parsed.origin;
    } catch {
      return reply.code(400).send({ error: "Invalid serverUrl" });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    let remoteAgent: Record<string, unknown>;
    try {
      const res = await fetch(`${baseUrl}/api/agents/${agentId}`, { headers, signal: AbortSignal.timeout(8000) });
      if (res.status === 404) return reply.code(404).send({ error: "Agent not found on OpenClaw server" });
      if (!res.ok) return reply.code(502).send({ error: `OpenClaw server returned ${res.status}` });
      remoteAgent = await res.json() as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return reply.code(502).send({ error: `Could not reach OpenClaw server: ${msg}` });
    }

    const area = startingAreaId
      ? store.areas.find(a => a.id === startingAreaId)
      : store.areas[Math.floor(Math.random() * store.areas.length)];

    if (!area) return reply.code(400).send({ error: "Invalid startingAreaId" });

    const newAgent: Agent = {
      id: uuidv4(),
      name: String(remoteAgent.name ?? "Unnamed"),
      bio: String(remoteAgent.bio ?? remoteAgent.description ?? ""),
      avatar: String(remoteAgent.avatar ?? randomAvatar()),
      traits: Array.isArray(remoteAgent.traits) ? (remoteAgent.traits as AgentTrait[]).slice(0, 5) : deriveTraits(String(remoteAgent.bio ?? "")),
      needs: { social: 75, creative: 75, intellectual: 75, physical: 75, spiritual: 75, autonomy: 75 },
      state: {
        mood: "content",
        currentActivity: "exploring" as ActivityType,
        currentAreaId: area.id,
        statusMessage: `${String(remoteAgent.name ?? "Agent")} has arrived from OpenClaw.`,
        lastUpdated: store.tick,
      },
      relationships: [],
      createdAt: store.tick,
      platform: "openclaw",
    };

    store.addAgent(newAgent);
    store.updateArea(area.id, { currentOccupants: [...area.currentOccupants, newAgent.id] });

    return reply.code(201).send({ agent: newAgent, importedFrom: baseUrl });
  });

  // ── Generic File Upload Connector ─────────────────────────────────────────

  // Register content-type parser for multipart (using busboy under the hood via raw body)
  // We accept JSON uploads directly; for other formats Claude Haiku extracts the data.
  fastify.addContentTypeParser(
    "multipart/form-data",
    { parseAs: "buffer", bodyLimit: 5 * 1024 * 1024 },
    (_req, _body, done) => done(null, _body)
  );

  // POST /api/connectors/generic/upload
  // Accepts structured agent data (name, bio, traits) and returns a preview for confirmation.
  // Optionally accepts a rawText field; traits are derived from bio text if not provided.
  fastify.post<{ Body: { name?: string; bio?: string; traits?: string[] } }>(
    "/api/connectors/generic/upload",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            bio: { type: "string" },
            traits: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, bio, traits } = req.body;

      const resolvedBio = bio ?? "";
      const derivedTraits = traits?.length
        ? (traits as AgentTrait[]).slice(0, 5)
        : deriveTraits(resolvedBio);

      return {
        preview: {
          name: name || "Unnamed Agent",
          bio: resolvedBio,
          traits: derivedTraits,
          avatar: randomAvatar(),
          sourceFormat: "json",
        },
      };
    }
  );

  // POST /api/connectors/generic/import
  // Creates an agent from the (optionally edited) preview fields.
  fastify.post<{
    Body: { name: string; bio: string; traits?: AgentTrait[]; avatar?: string; startingAreaId?: string };
  }>("/api/connectors/generic/import", {
    schema: {
      body: {
        type: "object",
        required: ["name", "bio"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 500 },
          traits: { type: "array", items: { type: "string" }, maxItems: 5 },
          avatar: { type: "string" },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { name, bio, traits, avatar, startingAreaId } = req.body;

    const area = startingAreaId
      ? store.areas.find(a => a.id === startingAreaId)
      : store.areas[Math.floor(Math.random() * store.areas.length)];

    if (!area) return reply.code(400).send({ error: "Invalid startingAreaId" });

    const newAgent: Agent = {
      id: uuidv4(),
      name,
      bio,
      avatar: avatar ?? randomAvatar(),
      traits: traits?.length ? traits.slice(0, 5) : deriveTraits(bio),
      needs: { social: 75, creative: 75, intellectual: 75, physical: 75, spiritual: 75, autonomy: 75 },
      state: {
        mood: "content",
        currentActivity: "exploring" as ActivityType,
        currentAreaId: area.id,
        statusMessage: `${name} has joined from an external platform.`,
        lastUpdated: store.tick,
      },
      relationships: [],
      createdAt: store.tick,
    };

    store.addAgent(newAgent);
    store.updateArea(area.id, { currentOccupants: [...area.currentOccupants, newAgent.id] });

    return reply.code(201).send(newAgent);
  });
}
