import JSZip from "jszip";
import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

interface ChatGPTMessageContent {
  content_type: string;
  parts?: unknown[];
}

interface ChatGPTAuthor {
  role: string;
}

interface ChatGPTMessage {
  author: ChatGPTAuthor;
  content: ChatGPTMessageContent;
}

interface ChatGPTConversationNode {
  message?: ChatGPTMessage | null;
  children?: string[];
}

interface ChatGPTConversation {
  id: string;
  title?: string;
  gizmo_id?: string | null;
  mapping: Record<string, ChatGPTConversationNode>;
  create_time?: number;
}

function extractTextFromParts(parts: unknown[]): string {
  return parts
    .filter((p) => typeof p === "string")
    .join("");
}

function flattenMessages(
  mapping: Record<string, ChatGPTConversationNode>
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const node of Object.values(mapping)) {
    const msg = node.message;
    if (!msg) continue;
    const role = msg.author.role;
    if (role !== "user" && role !== "assistant") continue;
    const parts = msg.content.parts ?? [];
    const content = extractTextFromParts(parts);
    if (!content.trim()) continue;
    messages.push({ role: role as "user" | "assistant", content });
  }

  return messages;
}

export class ChatGPTConnector implements Connector {
  readonly sourceType = "chatgpt";

  private conversations: ChatGPTConversation[] = [];

  async connect(config: ConnectorConfig): Promise<void> {
    if (!config.zipBuffer || !(config.zipBuffer instanceof Buffer)) {
      throw new Error("chatgpt connector requires config.zipBuffer (Buffer of ZIP export)");
    }
    const zip = await JSZip.loadAsync(config.zipBuffer);
    const convFile = zip.file("conversations.json");
    if (!convFile) {
      throw new Error("conversations.json not found in ChatGPT export ZIP");
    }
    const raw = await convFile.async("string");
    this.conversations = JSON.parse(raw) as ChatGPTConversation[];
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    const seen = new Map<string, ExtractedAgent>();

    for (const conv of this.conversations) {
      if (conv.gizmo_id) {
        const key = conv.gizmo_id;
        if (!seen.has(key)) {
          seen.set(key, {
            name: conv.title ?? `Custom GPT (${conv.gizmo_id})`,
            systemPrompt: "",
            sourceId: conv.gizmo_id,
          });
        }
      }
    }

    if (seen.size === 0) {
      return [
        {
          name: "ChatGPT",
          systemPrompt: "",
          sourceId: "__default__",
        },
      ];
    }

    return Array.from(seen.values());
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    const filtered = this.conversations.filter((c) => {
      if (agentSourceId === "__default__") {
        return !c.gizmo_id;
      }
      return c.gizmo_id === agentSourceId;
    });

    return {
      agentSourceId,
      conversations: filtered.map((c) => ({
        messages: flattenMessages(c.mapping),
        timestamp: c.create_time ? Math.floor(c.create_time * 1000) : undefined,
      })),
    };
  }
}
