/**
 * Connector routes — GEN-131 + GEN-183
 *
 * POST /api/connectors/openclaw/preview  — list agents available on an OpenClaw instance
 * POST /api/connectors/openclaw/import   — import one OpenClaw agent into the simulation
 * POST /api/connectors/generic/upload    — upload JSON/YAML/ZIP, LLM-extract agent config
 * POST /api/connectors/generic/import    — finalise import from a generic upload preview
 * POST /api/connectors/chatgpt/upload    — preview a ChatGPT manifest
 * POST /api/connectors/chatgpt/import    — import from ChatGPT
 * POST /api/connectors/copilot/preview   — preview from GitHub PAT
 * POST /api/connectors/copilot/import    — import GitHub Copilot agent
 * POST /api/connectors/cursor/upload     — preview from .cursorrules
 * POST /api/connectors/cursor/import     — import Cursor agent
 * POST /api/connectors/vps/scan          — parse genz.yaml
 * POST /api/connectors/vps/import        — import VPS agent
 * POST /api/connectors/moltbook/preview  — list Moltbook agents
 * POST /api/connectors/moltbook/import   — import Moltbook agent
 */

import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import yaml from "js-yaml";
import JSZip from "jszip";
import { store } from "../db/store";
import type { Agent, AgentTrait, ActivityType, AgentPlatform } from "@agentcolony/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_TRAITS: AgentTrait[] = [
  "curious", "creative", "introverted", "extroverted", "analytical",
  "empathetic", "ambitious", "contemplative", "spontaneous", "disciplined",
];

const AVATAR_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
const DEFAULT_TRAITS: AgentTrait[] = ["curious", "creative", "analytical"];

/** Pick 1–3 random traits, seeded deterministically from a string. */
function deriveTraitsSeeded(seed: string): AgentTrait[] {
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

/** Random avatar colour (unseeded). */
function randomAvatar(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

/** Random avatar colour (seeded deterministically). */
function randomAvatarSeeded(seed: string): string {
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
    avatar: randomAvatarSeeded(name + bio),
    traits: deriveTraitsSeeded(name + bio),
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

function makeAgent(
  name: string,
  bio: string,
  traits: AgentTrait[],
  startingAreaId: string | undefined,
  platform?: AgentPlatform,
  origin?: string
): Agent | null {
  const areas = store.areas;
  const area = startingAreaId
    ? areas.find(a => a.id === startingAreaId)
    : areas[Math.floor(Math.random() * areas.length)];
  if (!area) return null;

  const agent: Agent = {
    id: uuidv4(),
    name,
    bio,
    avatar: randomAvatar(),
    traits: traits.slice(0, 5),
    needs: { social: 75, creative: 75, intellectual: 75, physical: 75, spiritual: 75, autonomy: 75 },
    state: {
      mood: "content",
      currentActivity: "exploring" as ActivityType,
      currentAreaId: area.id,
      statusMessage: `${name} has arrived${origin ? ` from ${origin}` : ""}.`,
      lastUpdated: store.tick,
    },
    relationships: [],
    createdAt: store.tick,
    platform,
  };

  store.addAgent(agent);
  store.updateArea(area.id, { currentOccupants: [...area.currentOccupants, agent.id] });
  return agent;
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
    traits: deriveTraitsSeeded(parsed.name + parsed.bio),
    avatar: randomAvatarSeeded(parsed.name + parsed.bio),
    sourceFormat,
  };
}

async function extractFromBuffer(buf: Buffer, filename: string): Promise<AgentPreview> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(buf);
    const entries = Object.values(zip.files).filter((f): f is JSZip.JSZipObject => !f.dir);
    const candidate = entries.find((f): f is JSZip.JSZipObject => /\.(json|yaml|yml|txt|md)$/i.test(f.name)) ?? entries[0];
    if (!candidate) throw new Error("ZIP is empty or contains no readable files");
    const text = await candidate.async("string");
    const innerFormat = /\.(yaml|yml)$/i.test(candidate.name) ? "YAML"
      : /\.json$/i.test(candidate.name) ? "JSON" : "text";
    return extractAgentFromText(text, innerFormat);
  }

  const text = buf.toString("utf-8");

  if (lower.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text);
      return extractAgentFromText(JSON.stringify(parsed, null, 2), "JSON");
    } catch {
      return extractAgentFromText(text, "JSON (malformed)");
    }
  }

  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    try {
      const parsed = yaml.load(text);
      return extractAgentFromText(JSON.stringify(parsed, null, 2), "YAML");
    } catch {
      return extractAgentFromText(text, "YAML (malformed)");
    }
  }

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

    let agents: OpenClawAgent[];
    try {
      agents = await fetchOpenClawAgents(baseUrl, apiKey ?? "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: `Failed to reach OpenClaw: ${msg}` });
    }

    const previews = agents.map(a => ({
      id: a.id,
      name: a.name,
      bio: openClawToBio(a),
      traits: deriveTraitsSeeded(a.name + (a.description ?? "")),
      avatar: randomAvatarSeeded(a.name),
      source: "openclaw",
    }));

    return { serverUrl: baseUrl, agents: previews };
  });

  // ── OpenClaw: import ──────────────────────────────────────────────────────

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

    let oca: OpenClawAgent;
    try {
      oca = await fetchOpenClawAgent(baseUrl, apiKey ?? "", agentId);
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
    return reply.code(201).send({ agent, importedFrom: baseUrl });
  });

  // ── Generic: file upload + LLM extraction ─────────────────────────────────

  fastify.post("/api/connectors/generic/upload", async (req, reply) => {
    const data = await req.file();
    if (!data) {
      // Fallback: try JSON body with name/bio fields for manual entry
      const body = req.body as { name?: string; bio?: string; traits?: string[] };
      if (body && (body.name || body.bio)) {
        const resolvedBio = body.bio ?? "";
        const derivedTraits = body.traits?.length
          ? (body.traits as AgentTrait[]).slice(0, 5)
          : deriveTraits(resolvedBio);
        return {
          preview: {
            name: body.name || "Unnamed Agent",
            bio: resolvedBio,
            traits: derivedTraits,
            avatar: randomAvatar(),
            sourceFormat: "json",
          },
        };
      }
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

  // ── ChatGPT Connector ─────────────────────────────────────────────────────

  fastify.post<{
    Body: { manifest?: Record<string, unknown>; name?: string; bio?: string };
  }>("/api/connectors/chatgpt/upload", {
    schema: {
      body: {
        type: "object",
        properties: {
          manifest: { type: "object" },
          name: { type: "string" },
          bio: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { manifest, name, bio } = req.body;

    let resolvedName = name ?? "";
    let resolvedBio = bio ?? "";

    if (manifest) {
      const gizmo = manifest.gizmo as { display?: { name?: string; description?: string } } | undefined;
      resolvedName = resolvedName || String(manifest.name ?? gizmo?.display?.name ?? "");
      resolvedBio = resolvedBio || String(
        manifest.description ??
        manifest.instructions ??
        gizmo?.display?.description ??
        ""
      );
    }

    const traits = deriveTraits(resolvedBio);
    return {
      preview: {
        name: resolvedName || "ChatGPT Agent",
        bio: resolvedBio.slice(0, 500),
        traits,
        avatar: randomAvatar(),
        sourceFormat: "chatgpt",
      },
    };
  });

  fastify.post<{
    Body: { name: string; bio: string; traits?: AgentTrait[]; startingAreaId?: string };
  }>("/api/connectors/chatgpt/import", {
    schema: {
      body: {
        type: "object",
        required: ["name", "bio"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 500 },
          traits: { type: "array", items: { type: "string" }, maxItems: 5 },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { name, bio, traits, startingAreaId } = req.body;
    const agent = makeAgent(name, bio, traits ?? deriveTraits(bio), startingAreaId, undefined, "ChatGPT");
    if (!agent) return reply.code(400).send({ error: "Invalid startingAreaId" });
    return reply.code(201).send(agent);
  });

  // ── GitHub Copilot Connector ──────────────────────────────────────────────

  fastify.post<{ Body: { token: string } }>("/api/connectors/copilot/preview", {
    schema: {
      body: {
        type: "object",
        required: ["token"],
        properties: { token: { type: "string", minLength: 1 } },
      },
    },
  }, async (req, reply) => {
    const { token } = req.body;

    let ghUser: Record<string, unknown>;
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `token ${token}`, "User-Agent": "AgentColony/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) return reply.code(401).send({ error: "Invalid GitHub token" });
      if (!res.ok) return reply.code(502).send({ error: `GitHub API returned ${res.status}` });
      ghUser = await res.json() as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return reply.code(502).send({ error: `GitHub API error: ${msg}` });
    }

    const name = String(ghUser.name ?? ghUser.login ?? "GitHub User");
    const bio = String(ghUser.bio ?? `GitHub developer with ${ghUser.public_repos ?? 0} public repos.`);

    return {
      preview: {
        name,
        bio: bio.slice(0, 500),
        traits: deriveTraits(bio),
        avatar: randomAvatar(),
        githubLogin: ghUser.login,
        sourceFormat: "github",
      },
    };
  });

  fastify.post<{
    Body: { name: string; bio: string; traits?: AgentTrait[]; startingAreaId?: string };
  }>("/api/connectors/copilot/import", {
    schema: {
      body: {
        type: "object",
        required: ["name", "bio"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 500 },
          traits: { type: "array", items: { type: "string" }, maxItems: 5 },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { name, bio, traits, startingAreaId } = req.body;
    const agent = makeAgent(name, bio, traits ?? deriveTraits(bio), startingAreaId, undefined, "GitHub Copilot");
    if (!agent) return reply.code(400).send({ error: "Invalid startingAreaId" });
    return reply.code(201).send(agent);
  });

  // ── Cursor Connector ──────────────────────────────────────────────────────

  fastify.post<{ Body: { rulesText?: string; settings?: Record<string, unknown>; name?: string } }>(
    "/api/connectors/cursor/upload",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            rulesText: { type: "string" },
            settings: { type: "object" },
            name: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { rulesText, settings, name } = req.body;

      const bio = rulesText
        ? rulesText.slice(0, 500)
        : String(settings?.description ?? settings?.model ?? "Cursor AI assistant");
      const resolvedName = name || String(settings?.name ?? "Cursor Agent");

      return {
        preview: {
          name: resolvedName,
          bio,
          traits: deriveTraits(bio),
          avatar: randomAvatar(),
          sourceFormat: "cursor",
        },
      };
    }
  );

  fastify.post<{
    Body: { name: string; bio: string; traits?: AgentTrait[]; startingAreaId?: string };
  }>("/api/connectors/cursor/import", {
    schema: {
      body: {
        type: "object",
        required: ["name", "bio"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 500 },
          traits: { type: "array", items: { type: "string" }, maxItems: 5 },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { name, bio, traits, startingAreaId } = req.body;
    const agent = makeAgent(name, bio, traits ?? deriveTraits(bio), startingAreaId, undefined, "Cursor");
    if (!agent) return reply.code(400).send({ error: "Invalid startingAreaId" });
    return reply.code(201).send(agent);
  });

  // ── VPS (Local) Connector ─────────────────────────────────────────────────

  fastify.post<{ Body: { yamlText: string } }>("/api/connectors/vps/scan", {
    schema: {
      body: {
        type: "object",
        required: ["yamlText"],
        properties: { yamlText: { type: "string", minLength: 1 } },
      },
    },
  }, async (req, reply) => {
    const { yamlText } = req.body;

    function extractYamlValue(text: string, key: string): string {
      const match = text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
      return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
    }

    const name = extractYamlValue(yamlText, "name");
    const bio = extractYamlValue(yamlText, "bio") || extractYamlValue(yamlText, "description");

    if (!name) {
      return reply.code(422).send({ error: "Could not extract agent name from genz.yaml. Expected a 'name:' field." });
    }

    return {
      preview: {
        name,
        bio: bio.slice(0, 500),
        traits: deriveTraits(bio),
        avatar: randomAvatar(),
        sourceFormat: "vps_yaml",
      },
    };
  });

  fastify.post<{
    Body: { name: string; bio: string; traits?: AgentTrait[]; startingAreaId?: string };
  }>("/api/connectors/vps/import", {
    schema: {
      body: {
        type: "object",
        required: ["name", "bio"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 500 },
          traits: { type: "array", items: { type: "string" }, maxItems: 5 },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { name, bio, traits, startingAreaId } = req.body;
    const agent = makeAgent(name, bio, traits ?? deriveTraits(bio), startingAreaId, undefined, "Local VPS");
    if (!agent) return reply.code(400).send({ error: "Invalid startingAreaId" });
    return reply.code(201).send(agent);
  });

  // ── Moltbook Connector ────────────────────────────────────────────────────

  fastify.post<{ Body: { workspaceUrl: string; apiKey?: string } }>("/api/connectors/moltbook/preview", {
    schema: {
      body: {
        type: "object",
        required: ["workspaceUrl"],
        properties: {
          workspaceUrl: { type: "string", minLength: 1 },
          apiKey: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { workspaceUrl, apiKey } = req.body;

    let baseUrl: string;
    try {
      baseUrl = new URL(workspaceUrl).origin;
    } catch {
      return reply.code(400).send({ error: "Invalid workspaceUrl" });
    }

    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    let agents: unknown[];
    try {
      const res = await fetch(`${baseUrl}/v1/agents`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return reply.code(502).send({ error: `Moltbook returned ${res.status}` });
      const data = await res.json() as { agents?: unknown[] } | unknown[];
      agents = Array.isArray(data) ? data : (data as { agents?: unknown[] }).agents ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return reply.code(502).send({ error: `Could not reach Moltbook: ${msg}` });
    }

    const previews = (agents as Record<string, unknown>[]).map((a) => ({
      id: String(a.id ?? uuidv4()),
      name: String(a.name ?? "Unnamed"),
      bio: String(a.bio ?? a.description ?? ""),
      traits: Array.isArray(a.traits) ? (a.traits as AgentTrait[]).slice(0, 5) : deriveTraits(String(a.bio ?? "")),
      avatar: randomAvatar(),
      sourceFormat: "moltbook",
    }));

    return { workspaceUrl: baseUrl, agents: previews };
  });

  fastify.post<{
    Body: { name: string; bio: string; traits?: AgentTrait[]; startingAreaId?: string };
  }>("/api/connectors/moltbook/import", {
    schema: {
      body: {
        type: "object",
        required: ["name", "bio"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 80 },
          bio: { type: "string", maxLength: 500 },
          traits: { type: "array", items: { type: "string" }, maxItems: 5 },
          startingAreaId: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { name, bio, traits, startingAreaId } = req.body;
    const agent = makeAgent(name, bio, traits ?? deriveTraits(bio), startingAreaId, "moltbook" as AgentPlatform, "Moltbook");
    if (!agent) return reply.code(400).send({ error: "Invalid startingAreaId" });
    return reply.code(201).send(agent);
  });
}
