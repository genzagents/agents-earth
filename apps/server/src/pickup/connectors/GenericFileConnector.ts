/**
 * GenericFileConnector — Phase 3
 *
 * Handles manual uploads of agent data in multiple formats:
 *   - Plain text    → treated as a single memory blob for a generic agent
 *   - JSON          → parsed looking for name/systemPrompt/messages fields
 *   - Simple K/V    → e.g. "name: MyBot\nsystemPrompt: You are..."
 *
 * Uses heuristic extraction only — no LLM calls.
 */

import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

// ─── Internal shape ───────────────────────────────────────────────────────────

interface ParsedMessage {
  role: "user" | "assistant";
  content: string;
}

interface ParsedConversation {
  messages: ParsedMessage[];
  timestamp?: number;
}

interface ParsedAgentData {
  name?: string;
  systemPrompt?: string;
  description?: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  conversations?: Array<{
    messages?: Array<{ role: string; content: string }>;
    timestamp?: number;
  }>;
  // Allow extra keys
  [key: string]: unknown;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface GenericFileConfig extends ConnectorConfig {
  /** Raw text content, or a stringified JSON object */
  text?: string;
  /** Pre-parsed JSON object */
  data?: ParsedAgentData;
  /** Optional filename hint for better naming */
  filename?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a role string to "user" | "assistant" */
function normaliseRole(role: string): "user" | "assistant" {
  const r = role.toLowerCase().trim();
  if (r === "human" || r === "user") return "user";
  return "assistant";
}

/** Try to extract K/V pairs from plain text like "name: Foo\nsystemPrompt: Bar" */
function parseKeyValue(text: string): Partial<ParsedAgentData> {
  const result: Partial<ParsedAgentData> = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().replace(/\s+/g, "");
    const value = line.slice(colonIdx + 1).trim();
    if (!key || !value) continue;
    const normKey = key.charAt(0).toLowerCase() + key.slice(1);
    if (normKey === "name" || normKey === "systemPrompt" || normKey === "description" || normKey === "model") {
      (result as Record<string, string>)[normKey] = value;
    }
  }
  return result;
}

/** Generate a fallback name from a filename hint */
function nameFromFilename(filename?: string): string {
  if (!filename) return "Imported Agent";
  // Strip extension and convert dashes/underscores to spaces
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || "Imported Agent";
}

// ─── Connector ────────────────────────────────────────────────────────────────

export class GenericFileConnector implements Connector {
  readonly sourceType = "generic_file";

  private agents: ExtractedAgent[] = [];
  private memories: Map<string, ExtractedMemory> = new Map();

  async connect(config: ConnectorConfig): Promise<void> {
    const cfg = config as GenericFileConfig;

    // Parse the input into a canonical structure
    let data: ParsedAgentData | null = null;

    if (cfg.data && typeof cfg.data === "object") {
      data = cfg.data;
    } else if (cfg.text && typeof cfg.text === "string") {
      const trimmed = cfg.text.trim();

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        // Looks like JSON
        try {
          const parsed = JSON.parse(trimmed) as ParsedAgentData;
          data = Array.isArray(parsed) ? { conversations: parsed as never } : parsed;
        } catch {
          // Not valid JSON — fall through to K/V / plain text handling
        }
      }

      if (!data) {
        // Try K/V heuristic
        const kv = parseKeyValue(trimmed);
        if (Object.keys(kv).length > 0) {
          data = { ...kv };
        } else {
          // Treat the whole blob as memory for a generic agent
          data = {
            name: nameFromFilename(cfg.filename),
            messages: [{ role: "user", content: trimmed }],
          };
        }
      }
    }

    if (!data) {
      throw new Error("generic_file connector requires config.text or config.data");
    }

    // ── Extract agent ──────────────────────────────────────────────────────────
    const agentName = data.name ?? nameFromFilename(cfg.filename);
    const systemPrompt = data.systemPrompt ?? "";
    const description = data.description ?? (systemPrompt ? systemPrompt.slice(0, 120) : undefined);
    const sourceId = `generic_${Date.now()}`;

    const agent: ExtractedAgent = {
      name: agentName,
      systemPrompt,
      description,
      model: data.model,
      sourceId,
    };

    this.agents = [agent];

    // ── Extract memory ─────────────────────────────────────────────────────────
    const conversations: ParsedConversation[] = [];

    // Case 1: data has a `conversations` array
    if (Array.isArray(data.conversations) && data.conversations.length > 0) {
      for (const conv of data.conversations) {
        const msgs = (conv.messages ?? []).map(m => ({
          role: normaliseRole(m.role),
          content: String(m.content),
        }));
        if (msgs.length > 0) {
          conversations.push({ messages: msgs, timestamp: conv.timestamp });
        }
      }
    }

    // Case 2: data has a top-level `messages` array (flat conversation)
    if (conversations.length === 0 && Array.isArray(data.messages) && data.messages.length > 0) {
      const msgs = data.messages.map(m => ({
        role: normaliseRole(m.role),
        content: String(m.content),
      }));
      if (msgs.length > 0) {
        conversations.push({ messages: msgs });
      }
    }

    this.memories.set(sourceId, {
      agentSourceId: sourceId,
      conversations,
    });
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    return this.agents;
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    return (
      this.memories.get(agentSourceId) ?? {
        agentSourceId,
        conversations: [],
      }
    );
  }
}
