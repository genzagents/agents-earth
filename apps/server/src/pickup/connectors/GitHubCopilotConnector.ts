import type { Connector, ConnectorConfig, ExtractedAgent, ExtractedMemory } from "../ConnectorRegistry";

export class GitHubCopilotConnector implements Connector {
  readonly sourceType = "github_copilot";

  private accessToken = "";

  async connect(config: ConnectorConfig): Promise<void> {
    if (!config.accessToken || typeof config.accessToken !== "string") {
      throw new Error("github_copilot connector requires config.accessToken (GitHub OAuth token)");
    }
    this.accessToken = config.accessToken;
  }

  async extractAgents(): Promise<ExtractedAgent[]> {
    void this.accessToken; // validated in connect(); used for future API calls
    return [
      {
        name: "GitHub Copilot",
        systemPrompt:
          "You are GitHub Copilot, an AI coding assistant that helps developers write better code faster.",
        sourceId: "copilot-default",
      },
    ];
  }

  async extractMemory(agentSourceId: string): Promise<ExtractedMemory> {
    // Copilot conversation history is not accessible via API
    return {
      agentSourceId,
      conversations: [],
    };
  }
}
