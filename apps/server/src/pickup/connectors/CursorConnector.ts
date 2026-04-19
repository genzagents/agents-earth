import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

interface CursorMessage {
  type: "human" | "ai";
  text: string;
}

interface CursorConversation {
  id: string;
  title?: string;
  messages: CursorMessage[];
}

interface CursorHistoryJson {
  conversations: CursorConversation[];
}

function isCursorHistoryJson(value: unknown): value is CursorHistoryJson {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.conversations);
}

export class CursorConnector implements Connector {
  readonly sourceType = "cursor";

  private history: CursorHistoryJson = { conversations: [] };

  async connect(config: ConnectorConfig): Promise<void> {
    if (typeof config.historyJson !== "object" || config.historyJson === null) {
      throw new Error("cursor connector requires config.historyJson (parsed JSON object)");
    }
    if (!isCursorHistoryJson(config.historyJson)) {
      // Still accept it; we'll surface empty conversations
      this.history = { conversations: [] };
      return;
    }
    this.history = config.historyJson;
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    return [
      {
        name: "Cursor Agent",
        systemPrompt:
          "AI coding assistant integrated into the Cursor editor, helping developers write and understand code.",
        sourceId: "cursor-default",
      },
    ];
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    return {
      agentSourceId,
      conversations: this.history.conversations.map((conv) => ({
        messages: conv.messages.map((m) => ({
          role: (m.type === "human" ? "user" : "assistant") as "user" | "assistant",
          content: m.text,
        })),
      })),
    };
  }
}
