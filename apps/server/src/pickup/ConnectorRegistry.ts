/**
 * Connector interface and registry for the Pickup Layer.
 *
 * A connector knows how to speak to a specific source tool (e.g. Claude Desktop)
 * and extract agents + memory from it. The registry allows connectors to be added
 * at startup without modifying the pipeline code.
 */

export interface ExtractedAgent {
  name: string;
  systemPrompt: string;
  description?: string;
  model?: string;
  avatarColor?: string;
  /** Raw source identifier to aid dedup */
  sourceId?: string;
}

export interface ExtractedMemory {
  agentSourceId: string;
  conversations: Array<{
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    timestamp?: number;
  }>;
}

export interface ConnectorConfig {
  [key: string]: unknown;
}

export interface Connector {
  readonly sourceType: string;
  /**
   * Validate config and establish any connections needed.
   * Should be fast and idempotent.
   */
  connect(config: ConnectorConfig): Promise<void>;
  /**
   * Return all agents discoverable from this source.
   */
  extractAgents(): Promise<ExtractedAgent[]>;
  /**
   * Return conversation history for a specific agent.
   */
  extractMemory(agentSourceId: string): Promise<ExtractedMemory>;
}

class ConnectorRegistryImpl {
  private readonly connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    this.connectors.set(connector.sourceType, connector);
  }

  get(sourceType: string): Connector | undefined {
    return this.connectors.get(sourceType);
  }

  list(): string[] {
    return Array.from(this.connectors.keys());
  }
}

export const connectorRegistry = new ConnectorRegistryImpl();

// ─── Built-in connector config schemas (for /api/pickup/connectors) ────────────

export interface ConnectorSchema {
  sourceType: string;
  label: string;
  description: string;
  fields: Array<{
    name: string;
    label: string;
    type: "text" | "password" | "file" | "textarea";
    required: boolean;
    placeholder?: string;
  }>;
}

const connectorSchemas = new Map<string, ConnectorSchema>();

export function registerSchema(schema: ConnectorSchema): void {
  connectorSchemas.set(schema.sourceType, schema);
}

export function listSchemas(): ConnectorSchema[] {
  return Array.from(connectorSchemas.values());
}

// Register default schemas
registerSchema({
  sourceType: "claude_desktop",
  label: "Claude Desktop",
  description: "Import projects and conversations from Claude Desktop via JSON export.",
  fields: [
    {
      name: "file",
      label: "Export file (JSON)",
      type: "file",
      required: true,
      placeholder: "claude_desktop_export.json",
    },
  ],
});

registerSchema({
  sourceType: "openclaw",
  label: "OpenClaw",
  description: "Import agents from a running OpenClaw gateway.",
  fields: [
    {
      name: "gatewayUrl",
      label: "Gateway URL",
      type: "text",
      required: true,
      placeholder: "https://your-openclaw-gateway.example.com",
    },
    {
      name: "apiToken",
      label: "API Token",
      type: "password",
      required: true,
      placeholder: "oc_...",
    },
  ],
});

registerSchema({
  sourceType: "generic_file",
  label: "Generic Upload",
  description: "Paste or upload agent data in any text or JSON format.",
  fields: [
    {
      name: "text",
      label: "Paste your agent data",
      type: "textarea",
      required: true,
      placeholder: 'Paste JSON, plain text, or key:value pairs...\n\nExamples:\n{ "name": "MyBot", "systemPrompt": "You are..." }\n\nor\n\nname: MyBot\nsystemPrompt: You are a helpful assistant',
    },
  ],
});
