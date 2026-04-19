import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

export class MoltbookConnector implements Connector {
  readonly sourceType = "moltbook";

  private apiKey = "";

  async connect(config: ConnectorConfig): Promise<void> {
    if (!config.apiKey || typeof config.apiKey !== "string") {
      throw new Error("moltbook connector requires config.apiKey (string)");
    }
    this.apiKey = config.apiKey;
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    void this.apiKey; // validated in connect(); used for future API calls
    return [
      {
        name: "Moltbook Agent",
        systemPrompt: "You are a Moltbook notebook assistant.",
        sourceId: "moltbook-default",
      },
    ];
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    return {
      agentSourceId,
      conversations: [],
    };
  }
}
