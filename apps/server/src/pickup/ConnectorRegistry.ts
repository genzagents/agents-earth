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
