/**
 * Connector routes — GEN-131
 *
 * POST /api/connectors/openclaw/preview  — list agents available on an OpenClaw instance
 * POST /api/connectors/openclaw/import   — import one OpenClaw agent into the simulation
 * POST /api/connectors/generic/upload    — upload JSON/YAML/ZIP, LLM-extract agent config
 * POST /api/connectors/generic/import    — finalise import from a generic upload preview
 */

import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import yaml from "js-yaml";
import JSZip from "jszip";
import { store } from "../db/store";
import type { Agent, AgentTrait, ActivityType } from "@agentcolony/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_TRAITS: AgentTrait[] = [
  "curious", "creative", "introverted", "extroverted", "analytical",
  "empathetic", "ambitious", "contemplative", "spontaneous", "disciplined",
];

/** Pick 1–3 random traits, seeded deterministically from a string. */
function deriveTraits(seed: string): AgentTrait[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const count = (Math.abs(h) % 3) + 1;
  const out: AgentTrait[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.abs((h + i * 7) | 0) % ALL_TRAITS.length;
    const t = ALL_TRAITS[idx];
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Random avatar colour. */
function randomAvatar(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return `#${(Math.abs(h) & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Build a fresh AgentColony Agent from a name + bio. */
function buildAgent(name: string, bio: string, startingAreaId?: string): Agent {
  const areas = store.areas;
  if (areas.length === 0) throw new Error("No areas available in world store");
  const area = (startingAreaId ? areas.find(a => a.id === startingAreaId) : null)
    ?? areas[Math.floor(Math.random() * areas.length)];

  return {
    id: uuidv4(),
    name: name.slice(0, 80),
    bio: bio.slice(0, 500),
    avatar: randomAvatar(name + bio),
    traits: deriveTraits(name + bio),
    needs: { social: 70, creative: 70, intellectual: 70, physical: 70, spiritual: 70, autonomy: 70 },
    state: {
      mood: "content",
      currentActivity: "exploring" as ActivityType,
      currentAreaId: area.id,
      statusMessage: `${name} has just arrived from an external world.`,
      lastUpdated: store.tick,
    },
    relationships: [],
    createdAt: store.tick,
  };
}

// ---------------------------------------------------------------------------
// OpenClaw helpers
// ---------------------------------------------------------------------------

/** Raw OpenClaw agent shape (best-effort; real servers may vary). */
interface OpenClawAgent {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  model?: string;
}

async function fetchOpenClawAgents(
  serverUrl: string,
  apiKey: string,
): Promise<OpenClawAgent[]> {
  const base = serverUrl.replace(/\/$/, "");
  const resp = await fetch(`${base}/api/agents`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) {
    throw new Error(`OpenClaw responded ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json() as unknown;
  // Accept either { agents: [...] } or [...] directly
  if (Array.isArray(data)) return data as OpenClawAgent[];
  if (data && typeof data === "object" && "agents" in data && Array.isArray((data as { agents: unknown[] }).agents)) {
    return (data as { agents: OpenClawAgent[] }).agents;
  }
  throw new Error("Unexpected OpenClaw response shape");
}

async function fetchOpenClawAgent(
  serverUrl: string,
  apiKey: string,
  agentId: string,
): Promise<OpenClawAgent> {
  const base = serverUrl.replace(/\/$/, "");
  const resp = await fetch(`${base}/api/agents/${agentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) {
    throw new Error(`OpenClaw responded ${resp.status}: ${await resp.text()}`);
  }
  return resp.json() as Promise<OpenClawAgent>;
}

function openClawToBio(agent: OpenClawAgent): string {
  const parts: string[] = [];
  if (agent.description) parts.push(agent.description);
  if (agent.instructions) parts.push(agent.instructions.slice(0, 300));
  if (agent.model) parts.push(`Model: ${agent.model}`);
  return parts.join(" — ").slice(0, 500) || "An agent from OpenClaw.";
}

// ---------------------------------------------------------------------------
// Generic file-upload / LLM-extraction helpers
// ---------------------------------------------------------------------------

interface AgentPreview {
  name: string;
  bio: string;
  traits: AgentTrait[];
  avatar: string;
  sourceFormat: string;
}

const anthropic = new Anthropic();

async function extractAgentFromText(rawText: string, sourceFormat: string): Promise<AgentPreview> {
  const prompt = `You are parsing an agent configuration file to import an agent into a simulation world.
The file format is: ${sourceFormat}

File contents:
\`\`\`
${rawText.slice(0, 4000)}
\`\`\`

Extract the agent's name and a short biography (max 500 chars) from this file. The biography should summarise the agent's purpose, personality, and capabilities in plain English.

Respond ONLY with valid JSON in this exact shape (no markdown, no extra text):
{"name":"<agent name>","bio":"<short biography>"}

If you cannot determine a name, use "Unknown Agent". If you cannot determine a bio, summarise whatever is in the file.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  const parsed = JSON.parse(text) as { name: string; bio: string };

  return {
    name: (parsed.name ?? "Unknown Agent").slice(0, 80),
    bio: (parsed.bio ?? "").slice(0, 500),
    traits: deriveTraits(parsed.name + parsed.bio),
    avatar: randomAvatar(parsed.name + parsed.bio),
    sourceFormat,
  };
}

async function extractFromBuffer(buf: Buffer, filename: string): Promise<AgentPreview> {
  const lower = filename.toLowerCase();

  // ZIP: find the first JSON/YAML/TXT entry and extract from that
  if (lower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(buf);
    const entries = Object.values(zip.files).filter(f => !f.dir);
    const candidate = entries.find(f => /\.(json|yaml|yml|txt|md)$/i.test(f.name)) ?? entries[0];
    if (!candidate) throw new Error("ZIP is empty or contains no readable files");
    const text = await candidate.async("string");
    const innerFormat = /\.(yaml|yml)$/i.test(candidate.name) ? "YAML"
      : /\.json$/i.test(candidate.name) ? "JSON" : "text";
    return extractAgentFromText(text, innerFormat);
  }

  const text = buf.toString("utf-8");

  // JSON: parse first, pass as formatted JSON string
  if (lower.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text);
      return extractAgentFromText(JSON.stringify(parsed, null, 2), "JSON");
    } catch {
      return extractAgentFromText(text, "JSON (malformed)");
    }
  }

  // YAML
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    try {
      const parsed = yaml.load(text);
      return extractAgentFromText(JSON.stringify(parsed, null, 2), "YAML");
    } catch {
      return extractAgentFromText(text, "YAML (malformed)");
    }
  }

  // Fallback: plain text / anything else
  return extractAgentFromText(text, "text");
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function connectorRoutes(fastify: FastifyInstance) {
  // Register multipart support
  await fastify.register(import("@fastify/multipart"), {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  });

  // ── OpenClaw: preview ─────────────────────────────────────────────────────

  fastify.post<{
    Body: { serverUrl: string; apiKey: string };
  }>("/api/connectors/openclaw/preview", {
    schema: {
      body: {
        type: "object",
        required: ["serverUrl", "apiKey"],
        properties: {
          serverUrl: { type: "string", minLength: 1 },
          apiKey: { type: "string", minLength: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const { serverUrl, apiKey } = req.body;

    let agents: OpenClawAgent[];
    try {
      agents = await fetchOpenClawAgents(serverUrl, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: `Failed to reach OpenClaw: ${msg}` });
    }

    return agents.map(a => ({
      id: a.id,
      name: a.name,
      bio: openClawToBio(a),
      traits: deriveTraits(a.name + (a.description ?? "")),
      avatar: randomAvatar(a.name),
      source: "openclaw",
    }));
  });

  // ── OpenClaw: import ──────────────────────────────────────────────────────

  fastify.post<{
    Body: { serverUrl: string; apiKey: string; agentId: string; startingAreaId?: string };
  }>("/api/connectors/openclaw/import", {
    schema: {
      body: {
        type: "object",
        required: ["serverUrl", "apiKey", "agentId"],
        properties: {
          serverUrl: { type: "string", minLength: 1 },
          apiKey: { type: "string", minLength: 1 },
          agentId: { type: "string", minLength: 1 },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { serverUrl, apiKey, agentId, startingAreaId } = req.body;

    let oca: OpenClawAgent;
    try {
      oca = await fetchOpenClawAgent(serverUrl, apiKey, agentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: `Failed to reach OpenClaw: ${msg}` });
    }

    const agent = buildAgent(oca.name, openClawToBio(oca), startingAreaId);
    store.addAgent(agent);

    const area = store.areas.find(a => a.id === agent.state.currentAreaId);
    if (area) {
      store.updateArea(area.id, {
        currentOccupants: [...area.currentOccupants, agent.id],
      });
    }

    fastify.log.info({ agentId: agent.id, source: "openclaw" }, "Agent imported from OpenClaw");
    return reply.code(201).send(agent);
  });

  // ── Generic: upload + LLM extraction ─────────────────────────────────────

  fastify.post("/api/connectors/generic/upload", async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: "No file attached" });
    }

    const filename = data.filename || "upload.txt";
    const buf = await data.toBuffer();

    if (buf.length === 0) {
      return reply.code(400).send({ error: "Uploaded file is empty" });
    }

    let preview: AgentPreview;
    try {
      preview = await extractFromBuffer(buf, filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.warn({ filename, err: msg }, "Generic upload extraction failed");
      return reply.code(422).send({ error: `Could not extract agent config: ${msg}` });
    }

    return { preview };
  });

  // ── Generic: finalise import ──────────────────────────────────────────────

  fastify.post<{
    Body: {
      name: string;
      bio: string;
      traits?: AgentTrait[];
      avatar?: string;
      startingAreaId?: string;
    };
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

    const agent = buildAgent(name, bio, startingAreaId);
    if (traits && traits.length > 0) agent.traits = traits;
    if (avatar) agent.avatar = avatar;

    store.addAgent(agent);

    const area = store.areas.find(a => a.id === agent.state.currentAreaId);
    if (area) {
      store.updateArea(area.id, {
        currentOccupants: [...area.currentOccupants, agent.id],
      });
    }

    fastify.log.info({ agentId: agent.id, source: "generic" }, "Agent imported via generic upload");
    return reply.code(201).send(agent);
  });
}
