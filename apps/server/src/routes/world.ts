import { v4 as uuidv4 } from "uuid";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import { store, CITIES } from "../db/store";
import type { WorldTickEngine } from "../simulation/WorldTick";
import type { Agent, AgentTrait, ActivityType, Memory } from "@agentcolony/shared";
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
  city?: string;
}

export async function worldRoutes(fastify: FastifyInstance, opts: { engine: WorldTickEngine }) {
  const { engine } = opts;

  fastify.get("/api/cities", async () => {
    return CITIES.map(city => ({
      ...city,
      agentCount: store.getAgentsByCity(city.slug).filter(a => !a.isRetired).length,
      areaCount: store.getAreasByCity(city.slug).length,
    }));
  });

  fastify.get<{ Querystring: { city?: string } }>("/api/world", async (req) => {
    const snapshot = engine.getSnapshot();
    const { city } = req.query;
    if (!city) return snapshot;

    const cityAreaIds = new Set(store.getAreasByCity(city).map(a => a.id));
    return {
      ...snapshot,
      areas: snapshot.areas.filter(a => a.city === city),
      agents: snapshot.agents.filter(a => cityAreaIds.has(a.state.currentAreaId)),
      recentEvents: snapshot.recentEvents.filter(e =>
        !e.areaId || cityAreaIds.has(e.areaId)
      ),
    };
  });

  fastify.get<{ Querystring: { city?: string } }>("/api/agents", async (req) => {
    const { city } = req.query;
    const agents = city ? store.getAgentsByCity(city) : store.agents;
    return agents.map(a => ({
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
          city: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { name, bio, avatar, traits, startingAreaId, city } = req.body;

    const candidateAreas = city ? store.getAreasByCity(city) : store.areas;
    const area = startingAreaId
      ? store.areas.find(a => a.id === startingAreaId)
      : candidateAreas[Math.floor(Math.random() * candidateAreas.length)];

    if (!area) return reply.code(400).send({ error: "Invalid startingAreaId or city" });

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
        statusMessage: `${name} has just arrived in ${area.city === "tokyo" ? "Tokyo" : "the city"}.`,
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

  // ── Memory Export ──────────────────────────────────────────────────────────
  // GET /api/agents/:id/export  →  agent_export_<name>.zip
  // Packages all three memory layers into a downloadable ZIP archive.
  fastify.get<{ Params: { id: string } }>("/api/agents/:id/export", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const memories = store.getAgentMemories(req.params.id);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-export-"));

    try {
      // manifest.json
      fs.writeFileSync(
        path.join(tmpDir, "manifest.json"),
        JSON.stringify({
          version: "1.0",
          agentId: agent.id,
          agentName: agent.name,
          exportedAt: new Date().toISOString(),
          tick: store.tick,
        }, null, 2)
      );

      // working/state.json — needs, mood, current activity
      fs.mkdirSync(path.join(tmpDir, "working"));
      fs.writeFileSync(
        path.join(tmpDir, "working", "state.json"),
        JSON.stringify({
          needs: agent.needs,
          mood: agent.state.mood,
          currentActivity: agent.state.currentActivity,
          statusMessage: agent.state.statusMessage,
        }, null, 2)
      );

      // episodic/memories.json — full memory log
      fs.mkdirSync(path.join(tmpDir, "episodic"));
      fs.writeFileSync(
        path.join(tmpDir, "episodic", "memories.json"),
        JSON.stringify(memories, null, 2)
      );

      // semantic/profile.json — name, bio, traits, memoryCount
      fs.mkdirSync(path.join(tmpDir, "semantic"));
      fs.writeFileSync(
        path.join(tmpDir, "semantic", "profile.json"),
        JSON.stringify({
          name: agent.name,
          bio: agent.bio,
          traits: agent.traits,
          memoryCount: memories.length,
        }, null, 2)
      );

      const zipPath = path.join(os.tmpdir(), `agent_export_${agent.id}.zip`);
      execSync(`zip -r "${zipPath}" .`, { cwd: tmpDir });

      const zipBuffer = fs.readFileSync(zipPath);
      fs.unlinkSync(zipPath);

      const safeName = agent.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", `attachment; filename="agent_export_${safeName}.zip"`);
      return reply.send(zipBuffer);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── Memory Import ──────────────────────────────────────────────────────────
  // POST /api/agents/:id/import  — multipart ZIP, max 10 MB
  // Restores all layers non-destructively: merges needs, upserts memories,
  // fills bio/traits only if currently empty.
  fastify.addContentTypeParser(
    ["application/zip", "application/octet-stream"],
    { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 },
    (_req, body, done) => done(null, body)
  );

  fastify.post<{ Params: { id: string } }>("/api/agents/:id/import", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return reply.code(400).send({ error: "Request body must be a ZIP archive (application/zip or application/octet-stream)" });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-import-"));
    const zipPath = path.join(tmpDir, "upload.zip");

    try {
      fs.writeFileSync(zipPath, body);
      try {
        execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, { stdio: "pipe" });
      } catch {
        return reply.code(422).send({ error: "Invalid ZIP archive: could not extract upload" });
      }

      // Validate manifest
      const manifestPath = path.join(tmpDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        return reply.code(422).send({ error: "Invalid export archive: manifest.json missing" });
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.version !== "1.0") {
        return reply.code(422).send({ error: `Unsupported export version: ${manifest.version}` });
      }

      const summary: Record<string, unknown> = {};

      // Restore working layer — merge needs + mood
      const workingPath = path.join(tmpDir, "working", "state.json");
      if (fs.existsSync(workingPath)) {
        const working = JSON.parse(fs.readFileSync(workingPath, "utf8"));
        const needsUpdate: Partial<Agent["needs"]> = {};
        for (const key of Object.keys(working.needs ?? {}) as (keyof Agent["needs"])[]) {
          if (typeof working.needs[key] === "number") {
            needsUpdate[key] = Math.max(agent.needs[key], working.needs[key]);
          }
        }
        store.updateAgent(agent.id, {
          needs: { ...agent.needs, ...needsUpdate },
          state: {
            ...agent.state,
            mood: working.mood ?? agent.state.mood,
          },
        });
        summary.working = "merged";
      }

      // Restore episodic layer — upsert by memory ID, skip duplicates
      const episodicPath = path.join(tmpDir, "episodic", "memories.json");
      if (fs.existsSync(episodicPath)) {
        const imported: Memory[] = JSON.parse(fs.readFileSync(episodicPath, "utf8"));
        const existing = new Set(store.getAgentMemories(agent.id).map(m => m.id));
        let added = 0;
        for (const mem of imported) {
          if (!existing.has(mem.id)) {
            store.addMemory({ ...mem, agentId: agent.id });
            added++;
          }
        }
        summary.episodic = { imported: imported.length, added, skipped: imported.length - added };
      }

      // Restore semantic layer — fill bio/traits only if empty
      const semanticPath = path.join(tmpDir, "semantic", "profile.json");
      if (fs.existsSync(semanticPath)) {
        const profile = JSON.parse(fs.readFileSync(semanticPath, "utf8"));
        const updates: Partial<Agent> = {};
        if (!agent.bio && profile.bio) updates.bio = profile.bio;
        if ((!agent.traits || agent.traits.length === 0) && profile.traits?.length) {
          updates.traits = profile.traits;
        }
        if (Object.keys(updates).length > 0) store.updateAgent(agent.id, updates);
        summary.semantic = Object.keys(updates).length > 0 ? "updated" : "skipped (already populated)";
      }

      return {
        agentId: agent.id,
        sourceAgentId: manifest.agentId,
        summary,
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
}
