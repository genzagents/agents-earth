/**
 * Claude Desktop connector.
 *
 * Accepts an exported JSON payload from the Claude Desktop Bridge
 * (GEN-101). The Bridge reads the local Claude Desktop config/db and
 * serialises it to JSON, which is then POSTed to /api/pickup/run.
 *
 * Claude Desktop data format (as exported by the Bridge):
 * {
 *   projects: Array<{
 *     id: string,
 *     name: string,
 *     systemPrompt?: string,
 *     description?: string,
 *   }>,
 *   conversations: Array<{
 *     projectId?: string,   // null = default agent
 *     messages: Array<{ role: "human"|"assistant", content: string }>,
 *     createdAt?: number,
 *   }>
 * }
 *
 * If no Bridge is installed (Phase 3), users can also manually export
 * their Claude Desktop data as JSON and upload it.
 */

import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

interface ClaudeDesktopProject {
  id: string;
  name: string;
  systemPrompt?: string;
  description?: string;
  model?: string;
}

interface ClaudeDesktopMessage {
  role: "human" | "assistant" | "user";
  content: string;
}

interface ClaudeDesktopConversation {
  projectId?: string;
  messages: ClaudeDesktopMessage[];
  createdAt?: number;
}

interface ClaudeDesktopExport {
  projects?: ClaudeDesktopProject[];
  conversations?: ClaudeDesktopConversation[];
}

export class ClaudeDesktopConnector implements Connector {
  readonly sourceType = "claude_desktop";

  private data: ClaudeDesktopExport = {};

  async connect(config: ConnectorConfig): Promise<void> {
    if (!config.data || typeof config.data !== "object") {
      throw new Error("claude_desktop connector requires config.data (parsed JSON export)");
    }
    this.data = config.data as ClaudeDesktopExport;
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    const projects = this.data.projects ?? [];

    if (projects.length === 0) {
      // No projects — synthesise a default agent from conversation history
      return [
        {
          name: "My Claude Agent",
          systemPrompt: "",
          description: "Imported from Claude Desktop (no project configured)",
          sourceId: "__default__",
        },
      ];
    }

    return projects.map((p) => ({
      name: p.name,
      systemPrompt: p.systemPrompt ?? "",
      description: p.description,
      model: p.model,
      sourceId: p.id,
    }));
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    const conversations = (this.data.conversations ?? []).filter(
      (c) =>
        agentSourceId === "__default__"
          ? !c.projectId
          : c.projectId === agentSourceId
    );

    return {
      agentSourceId,
      conversations: conversations.map((c) => ({
        messages: c.messages.map((m) => ({
          role: (m.role === "human" ? "user" : "assistant") as "user" | "assistant",
          content: m.content,
        })),
        timestamp: c.createdAt,
      })),
    };
  }
}
