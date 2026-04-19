import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

const DEFAULT_BASE_URL = "https://api.openclaw.io";

export class OpenClawConnector implements Connector {
  readonly sourceType = "openclaw";

  private apiKey = "";
  private baseUrl = DEFAULT_BASE_URL;

  async connect(config: ConnectorConfig): Promise<void> {
    if (!config.apiKey || typeof config.apiKey !== "string") {
      throw new Error("openclaw connector requires config.apiKey (string)");
    }
    this.apiKey = config.apiKey;
    this.baseUrl =
      typeof config.baseUrl === "string" && config.baseUrl.length > 0
        ? config.baseUrl
        : DEFAULT_BASE_URL;
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    if (!this.apiKey) {
      return [];
    }
    // Real implementation would call GET ${this.baseUrl}/api/agents
    return [
      {
        name: "OpenClaw Agent",
        systemPrompt: "You are a helpful OpenClaw assistant.",
        sourceId: "openclaw-default",
      },
    ];
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    // No history API in spec
    return {
      agentSourceId,
      conversations: [],
    };
  }
}
