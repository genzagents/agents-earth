import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import Busboy, { type FileInfo } from "busboy";
import type { FastifyInstance } from "fastify";
import { store } from "../db/store";
import type { WorldTickEngine } from "../simulation/WorldTick";
import type { Agent, AgentTrait, ActivityType } from "@agentcolony/shared";
import { agentBrain } from "../simulation/AgentBrain";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024; // 20 MB

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

  // Serve uploaded files as static assets
  fastify.addContentTypeParser(
    "multipart/form-data",
    { parseAs: "buffer", bodyLimit: UPLOAD_LIMIT_BYTES + 4096 },
    (_req, body, done) => done(null, body)
  );

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

  // POST /api/agents/:id/attachments — multipart file upload
  fastify.post<{ Params: { id: string } }>("/api/agents/:id/attachments", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return reply.code(400).send({ error: "Expected multipart/form-data" });
    }

    const rawBody = req.body as Buffer;
    if (!rawBody?.length) return reply.code(400).send({ error: "No file data" });

    return new Promise<object>((resolve) => {
      const bb = Busboy({ headers: { "content-type": contentType }, limits: { files: 1, fileSize: UPLOAD_LIMIT_BYTES } });
      let done = false;

      bb.on("file", (_field: NodeJS.ReadableStream, fileStream: NodeJS.ReadableStream, info: FileInfo) => {
        const { filename, mimeType } = info;
        if (!filename) { fileStream.resume(); if (!done) { done = true; resolve(reply.code(400).send({ error: "No filename" })); } return; }

        const safeName = `${uuidv4()}_${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const filePath = path.join(UPLOAD_DIR, safeName);
        const ws = fs.createWriteStream(filePath);
        let size = 0;
        let truncated = false;

        fileStream.on("data", (c: Buffer) => { size += c.length; });
        fileStream.on("limit", () => { truncated = true; });
        fileStream.pipe(ws);

        ws.on("finish", () => {
          if (truncated) {
            fs.unlink(filePath, () => undefined);
            if (!done) { done = true; resolve(reply.code(413).send({ error: "File too large" })); }
            return;
          }
          const attachment = store.addAttachment({ id: uuidv4(), agentId: agent.id, filename: safeName, originalFilename: filename, mimeType, size, url: `/uploads/${safeName}`, createdAt: Date.now() });
          if (!done) { done = true; resolve(reply.code(201).send(attachment)); }
        });

        ws.on("error", () => { if (!done) { done = true; resolve(reply.code(500).send({ error: "Write failed" })); } });
      });

      bb.on("error", () => { if (!done) { done = true; resolve(reply.code(400).send({ error: "Malformed multipart" })); } });
      bb.on("finish", () => { if (!done) { done = true; resolve(reply.code(400).send({ error: "No file field" })); } });
      bb.write(rawBody);
      bb.end();
    });
  });

  // GET /api/agents/:id/attachments — list agent attachments
  fastify.get<{ Params: { id: string } }>("/api/agents/:id/attachments", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    return store.getAgentAttachments(req.params.id);
  });
}
