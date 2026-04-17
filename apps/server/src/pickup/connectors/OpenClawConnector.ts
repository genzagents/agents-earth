/**
 * OpenClawConnector — Phase 5
 *
 * Imports agents from a running OpenClaw gateway.
 *
 * Config:
 *   { gatewayUrl: string, apiToken: string }
 *
 * Protocol:
 *   GET {gatewayUrl}/api/agents                    → list agents
 *   GET {gatewayUrl}/api/agents/:id/sessions        → list sessions (conversation history)
 *
 * Auth errors (401/403) are handled gracefully — returns empty result set.
 */

import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

// ─── OpenClaw API shapes ──────────────────────────────────────────────────────

interface OpenClawAgent {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  system_prompt?: string;
  model?: string;
  avatarColor?: string;
  avatar_color?: string;
}

interface OpenClawMessage {
  role: "user" | "assistant" | "human";
  content: string;
}

interface OpenClawSession {
  id: string;
  messages?: OpenClawMessage[];
  transcript?: OpenClawMessage[];
  createdAt?: number;
  created_at?: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface OpenClawConfig extends ConnectorConfig {
  gatewayUrl: string;
  apiToken: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseRole(role: string): "user" | "assistant" {
  const r = role.toLowerCase().trim();
  if (r === "human" || r === "user") return "user";
  return "assistant";
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// ─── Connector ────────────────────────────────────────────────────────────────

export class OpenClawConnector implements Connector {
  readonly sourceType = "openclaw";

  private baseUrl = "";
  private token = "";
  private rawAgents: OpenClawAgent[] = [];

  async connect(config: ConnectorConfig): Promise<void> {
    const cfg = config as OpenClawConfig;

    if (!cfg.gatewayUrl || typeof cfg.gatewayUrl !== "string") {
      throw new Error("openclaw connector requires config.gatewayUrl");
    }
    if (!cfg.apiToken || typeof cfg.apiToken !== "string") {
      throw new Error("openclaw connector requires config.apiToken");
    }

    this.baseUrl = stripTrailingSlash(cfg.gatewayUrl);
    this.token = cfg.apiToken;

    // Fetch agents list — handle auth errors gracefully
    try {
      const resp = await fetch(`${this.baseUrl}/api/agents`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (resp.status === 401 || resp.status === 403) {
        // Auth failure — return empty set
        this.rawAgents = [];
        return;
      }

      if (!resp.ok) {
        throw new Error(`OpenClaw API returned ${resp.status} for /api/agents`);
      }

      const body = (await resp.json()) as OpenClawAgent[] | { agents: OpenClawAgent[] };
      this.rawAgents = Array.isArray(body) ? body : (body.agents ?? []);
    } catch (err) {
      if (err instanceof Error && err.message.includes("fetch")) {
        // Network error — treat as empty (gateway unreachable)
        this.rawAgents = [];
        return;
      }
      throw err;
    }
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    return this.rawAgents.map(a => ({
      name: a.name,
      systemPrompt: a.systemPrompt ?? a.system_prompt ?? "",
      description: a.description,
      model: a.model,
      avatarColor: a.avatarColor ?? a.avatar_color,
      sourceId: a.id,
    }));
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    // Try fetching sessions for this agent
    let sessions: OpenClawSession[] = [];

    try {
      const resp = await fetch(`${this.baseUrl}/api/agents/${agentSourceId}/sessions`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
        // Not available — return empty memory
        return { agentSourceId, conversations: [] };
      }

      if (resp.ok) {
        const body = (await resp.json()) as OpenClawSession[] | { sessions: OpenClawSession[] };
        sessions = Array.isArray(body) ? body : (body.sessions ?? []);
      }
    } catch {
      // Network error — return empty
      return { agentSourceId, conversations: [] };
    }

    const conversations = sessions
      .map(s => {
        const msgs = (s.messages ?? s.transcript ?? []).map(m => ({
          role: normaliseRole(m.role),
          content: String(m.content),
        }));
        return {
          messages: msgs,
          timestamp: s.createdAt ?? s.created_at,
        };
      })
      .filter(c => c.messages.length > 0);

    return { agentSourceId, conversations };
  }
}
