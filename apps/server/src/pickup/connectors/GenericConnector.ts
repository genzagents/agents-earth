import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

interface GenericMessage {
  role: "user" | "assistant";
  content: string;
}

interface GenericConversation {
  messages: GenericMessage[];
  timestamp?: number;
}

interface GenericAgentShape {
  name?: unknown;
  systemPrompt?: unknown;
  description?: unknown;
  sourceId?: unknown;
}

function isGenericMessage(v: unknown): v is GenericMessage {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    (obj.role === "user" || obj.role === "assistant") &&
    typeof obj.content === "string"
  );
}

function isGenericConversation(v: unknown): v is GenericConversation {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.messages) && obj.messages.every(isGenericMessage);
}

export class GenericConnector implements Connector {
  readonly sourceType = "generic";

  private data: unknown = null;

  async connect(config: ConnectorConfig): Promise<void> {
    // Accept any data, store as-is
    this.data = config.data ?? null;
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    if (typeof this.data === "object" && this.data !== null) {
      const obj = this.data as Record<string, unknown>;
      if (Array.isArray(obj.agents) && obj.agents.length > 0) {
        const agents: ExtractedAgent[] = obj.agents
          .filter((a: unknown) => typeof a === "object" && a !== null)
          .map((a: unknown) => {
            const ag = a as GenericAgentShape;
            return {
              name: typeof ag.name === "string" ? ag.name : "Imported Agent",
              systemPrompt: typeof ag.systemPrompt === "string" ? ag.systemPrompt : "",
              description: typeof ag.description === "string" ? ag.description : undefined,
              sourceId: typeof ag.sourceId === "string" ? ag.sourceId : "generic-default",
            };
          });
        if (agents.length > 0) return agents;
      }
    }
    return [
      {
        name: "Imported Agent",
        systemPrompt: "",
        sourceId: "generic-default",
      },
    ];
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    if (typeof this.data === "object" && this.data !== null) {
      const obj = this.data as Record<string, unknown>;

      // Try data.conversations first
      if (Array.isArray(obj.conversations) && obj.conversations.every(isGenericConversation)) {
        return {
          agentSourceId,
          conversations: obj.conversations.map((c) => ({
            messages: c.messages,
            timestamp: c.timestamp,
          })),
        };
      }

      // Try data.messages as a flat message list
      if (Array.isArray(obj.messages) && obj.messages.every(isGenericMessage)) {
        return {
          agentSourceId,
          conversations: [
            {
              messages: obj.messages,
            },
          ],
        };
      }
    }

    return {
      agentSourceId,
      conversations: [],
    };
  }
}
