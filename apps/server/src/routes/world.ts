import { v4 as uuidv4 } from "uuid";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Busboy, { type FileInfo } from "busboy";
import type { FastifyInstance } from "fastify";
import { store } from "../db/store";
import type { WorldTickEngine } from "../simulation/WorldTick";
import type { Agent, AgentTrait, ActivityType, Memory } from "@agentcolony/shared";
import { agentBrain } from "../simulation/AgentBrain";
import { agentScheduler } from "../simulation/AgentScheduler";
import { vectorMemory } from "../services/VectorMemoryService";
import { agentRateLimiter, isAdminRequest, DEFAULT_REQUESTS_PER_MINUTE } from "../middleware/AgentRateLimiter";
import { promptFilter, type InjectionAction } from "../middleware/PromptInjectionFilter";
import { createDID } from "../services/did";
import { provisionWallet } from "../services/wallet";
import {
  slash,
  restore,
  getReputation,
  getReputationEvents,
  getAllReputationEvents,
  isSuspended,
} from "../services/ReputationService";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024; // 20 MB

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
    return {
      ...agent,
      reputationScore:
        agent.relationships.length + store.getAgentMemories(agent.id).length,
    };
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

    // Fire-and-forget DID creation (non-blocking)
    createDID(newAgent).then(result => {
      store.updateAgent(newAgent.id, { did: result.did, didAnchorTx: result.anchorTx ?? undefined });
      store.save();
    }).catch(err => console.error(`[did] Failed to create DID for agent ${newAgent.id}:`, err));

    return reply.code(201).send(newAgent);
  });

  fastify.post<{ Params: { id: string } }>("/api/agents/:id/provision-wallet", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    if (agent.walletAddress) return { agentId: agent.id, walletAddress: agent.walletAddress, alreadyProvisioned: true };
    let result;
    try {
      result = await provisionWallet(agent.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: `Wallet provisioning failed: ${message}` });
    }
    if (!result) return reply.code(503).send({ error: "Wallet provisioning unavailable — PRIVY_APP_ID and PRIVY_APP_SECRET are not configured." });
    store.updateAgent(agent.id, { walletAddress: result.walletAddress });
    store.save();
    return { agentId: agent.id, walletAddress: result.walletAddress, chainType: result.chainType, alreadyProvisioned: false };
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

    // Suspension gate — suspended agents cannot chat
    if (isSuspended(agent.id)) {
      return reply.code(403).send({ error: "Agent is suspended due to reputation violations" });
    }

    let { message } = req.body;

    // Rate limit chat (respects per-agent config; admin bypass via X-Admin-Secret)
    const isAdmin = isAdminRequest(req.headers["x-admin-secret"] as string | undefined);
    const rl = agentRateLimiter.check(agent.id, isAdmin);
    if (!rl.allowed) {
      const retrySecs = Math.ceil(rl.retryAfterMs / 1000);
      reply.header("Retry-After", String(retrySecs));
      slash(agent.id, "rate_limit_violation", "Automatic slash: rate limit exceeded");
      return reply.code(429).send({ error: "Rate limit exceeded", retryAfterMs: rl.retryAfterMs });
    }

    // Prompt injection check
    const classifyResult = promptFilter.classify(message);
    if (classifyResult.injectionDetected) {
      const action = promptFilter.resolveAction(agent.id);
      if (action === "block") {
        return reply.code(400).send({
          error: "Message blocked: prompt injection detected",
          detections: classifyResult.detections.map(d => ({ kind: d.kind, match: d.match })),
        });
      }
      if (action === "sanitize") {
        message = classifyResult.sanitized;
      }
      // "warn" falls through — message passes unchanged, detection logged
      fastify.log.warn({ agentId: agent.id, detections: classifyResult.detections }, "[PromptFilter] Injection pattern detected");
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

  // ── Per-agent rate limit management endpoints ─────────────────────────────

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

  // ── Always-on autonomous agent endpoints ──────────────────────────────────

  // GET /api/agents/:id/schedule — get current always-on config
  fastify.get<{ Params: { id: string } }>("/api/agents/:id/schedule", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    return {
      agentId: agent.id,
      always_on: agent.always_on ?? false,
      pollIntervalTicks: agent.pollIntervalTicks ?? 30,
      watchEventKinds: agent.watchEventKinds ?? [],
    };
  });

  // POST /api/agents/:id/schedule — enable always-on mode
  fastify.post<{
    Params: { id: string };
    Body: { pollIntervalTicks?: number; watchEventKinds?: string[]; wallClockIntervalMs?: number };
  }>("/api/agents/:id/schedule", {
    schema: {
      body: {
        type: "object",
        properties: {
          pollIntervalTicks: { type: "integer", minimum: 1, maximum: 86400 },
          watchEventKinds: { type: "array", items: { type: "string" }, maxItems: 10 },
          wallClockIntervalMs: { type: "integer", minimum: 5000 },
        },
      },
    },
  }, async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    if (agent.isRetired) return reply.code(400).send({ error: "Cannot schedule a retired agent" });

    const { pollIntervalTicks, watchEventKinds, wallClockIntervalMs } = req.body;

    store.updateAgent(agent.id, {
      always_on: true,
      pollIntervalTicks: pollIntervalTicks ?? agent.pollIntervalTicks ?? 30,
      watchEventKinds: watchEventKinds ?? agent.watchEventKinds ?? [],
    });

    if (wallClockIntervalMs) {
      agentScheduler.scheduleWallClock(agent.id, wallClockIntervalMs);
    }

    const updated = store.getAgent(agent.id)!;
    return reply.code(200).send({
      agentId: updated.id,
      always_on: updated.always_on,
      pollIntervalTicks: updated.pollIntervalTicks,
      watchEventKinds: updated.watchEventKinds,
      wallClockIntervalMs: wallClockIntervalMs ?? null,
    });
  });

  // DELETE /api/agents/:id/schedule — disable always-on mode
  fastify.delete<{ Params: { id: string } }>("/api/agents/:id/schedule", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });

    store.updateAgent(agent.id, { always_on: false });
    agentScheduler.cancelWallClock(agent.id);

    return reply.code(200).send({ agentId: agent.id, always_on: false });
  });

  // POST /api/agents/:id/wake — manually trigger an agent brain refresh
  fastify.post<{ Params: { id: string } }>("/api/agents/:id/wake", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    if (agent.isRetired) return reply.code(400).send({ error: "Agent is retired" });

    const memories = store.getAgentMemories(agent.id);
    agentBrain.think(agent, memories);

    return reply.code(202).send({ agentId: agent.id, message: "Brain refresh triggered" });
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

  // ── Prompt injection filter configuration ──────────────────────────────────

  // GET /api/prompt-injection/config — get global default action
  fastify.get("/api/prompt-injection/config", async () => {
    return { defaultAction: promptFilter.getDefaultAction() };
  });

  // PUT /api/prompt-injection/config — set global default action
  fastify.put<{ Body: { defaultAction: InjectionAction } }>("/api/prompt-injection/config", {
    schema: {
      body: {
        type: "object",
        required: ["defaultAction"],
        properties: {
          defaultAction: { type: "string", enum: ["warn", "sanitize", "block"] },
        },
      },
    },
  }, async (req, reply) => {
    promptFilter.setDefaultAction(req.body.defaultAction);
    return reply.code(200).send({ defaultAction: req.body.defaultAction });
  });

  // GET /api/agents/:id/prompt-injection — get per-agent action override
  fastify.get<{ Params: { id: string } }>("/api/agents/:id/prompt-injection", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    return {
      agentId: agent.id,
      action: promptFilter.resolveAction(agent.id),
      override: promptFilter.getAgentAction(agent.id) ?? null,
      default: promptFilter.getDefaultAction(),
    };
  });

  // PUT /api/agents/:id/prompt-injection — set per-agent action override
  fastify.put<{ Params: { id: string }; Body: { action: InjectionAction } }>("/api/agents/:id/prompt-injection", {
    schema: {
      body: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["warn", "sanitize", "block"] },
        },
      },
    },
  }, async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    promptFilter.setAgentAction(agent.id, req.body.action);
    return reply.code(200).send({ agentId: agent.id, action: req.body.action });
  });

  // DELETE /api/agents/:id/prompt-injection — clear per-agent override
  fastify.delete<{ Params: { id: string } }>("/api/agents/:id/prompt-injection", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    promptFilter.clearAgentAction(agent.id);
    return reply.code(200).send({ agentId: agent.id, action: promptFilter.getDefaultAction() });
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

  // ── File Attachments ───────────────────────────────────────────────────────

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

  // ── Reputation endpoints ───────────────────────────────────────────────────

  // GET /api/agents/:id/reputation — get agent reputation score + suspension state
  fastify.get<{ Params: { id: string } }>("/api/agents/:id/reputation", async (req, reply) => {
    const agent = store.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: "Agent not found" });
    return getReputation(agent.id);
  });

  // GET /api/agents/:id/reputation/events — get reputation events for agent
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/agents/:id/reputation/events",
    async (req, reply) => {
      const agent = store.getAgent(req.params.id);
      if (!agent) return reply.code(404).send({ error: "Agent not found" });
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      return getReputationEvents(agent.id, limit);
    },
  );

  // GET /api/admin/reputation/events — get all reputation events (admin only)
  fastify.get<{ Querystring: { limit?: string } }>("/api/admin/reputation/events", async (req, reply) => {
    if (!isAdminRequest(req.headers["x-admin-secret"] as string | undefined)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;
    return getAllReputationEvents(limit);
  });

  // POST /api/admin/reputation/slash — manually slash an agent's reputation
  fastify.post<{ Body: { agentId: string; kind: string; note: string; amount?: number } }>(
    "/api/admin/reputation/slash",
    async (req, reply) => {
      if (!isAdminRequest(req.headers["x-admin-secret"] as string | undefined)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const { agentId, kind, note, amount } = req.body;
      if (!agentId || !kind || !note) {
        return reply.code(400).send({ error: "agentId, kind, and note are required" });
      }
      const agent = store.getAgent(agentId);
      if (!agent) return reply.code(404).send({ error: "Agent not found" });
      const result = slash(agentId, kind as import("@agentcolony/shared").ReputationAbuseKind, note, amount);
      return reply.code(200).send(result);
    },
  );

  // POST /api/admin/reputation/restore — restore a suspended agent
  fastify.post<{ Body: { agentId: string; newScore?: number; note: string } }>(
    "/api/admin/reputation/restore",
    async (req, reply) => {
      if (!isAdminRequest(req.headers["x-admin-secret"] as string | undefined)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const { agentId, newScore = 50, note } = req.body;
      if (!agentId || !note) {
        return reply.code(400).send({ error: "agentId and note are required" });
      }
      const agent = store.getAgent(agentId);
      if (!agent) return reply.code(404).send({ error: "Agent not found" });
      const result = restore(agentId, newScore, note);
      return reply.code(200).send(result);
    },
  );
}
