import Anthropic from "@anthropic-ai/sdk";
import {
  findAgentById,
  getConversation,
  appendToConversation,
  type ConversationMessage,
} from "../db/ownedAgentStore";

export interface InvokeParams {
  agentId: string;
  userId: string;
  message: string;
}

export interface InvokeResult {
  response: string;
  tokensUsed: { input: number; output: number; total: number };
}

// Working memory: keep the most recent N messages to cap context size
const MAX_HISTORY_MESSAGES = 20;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export class RuntimeService {
  async invoke(params: InvokeParams): Promise<InvokeResult> {
    const { agentId, userId, message } = params;

    // 1. Fetch agent entity
    const agent = await findAgentById(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.userId !== userId) throw new Error("Forbidden: agent does not belong to user");

    // 2. Fetch working memory (recent conversation history from Supabase)
    const history = await getConversation(agentId, userId);
    const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

    // 3. Assemble messages for the model
    const messages: Anthropic.MessageParam[] = [
      ...recentHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    // 4. Route to Claude (model router stub — uses agent.model, defaults to claude-sonnet-4-6)
    const modelId = agent.model || "claude-sonnet-4-6";

    const response = await client.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: agent.systemPrompt || undefined,
      messages,
    });

    const assistantContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const tokensUsed = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
    };

    // 5. Write back to working memory
    await appendToConversation(agentId, userId, [
      { role: "user", content: message },
      { role: "assistant", content: assistantContent },
    ]);

    // 6. Token metering stub: earmark 2% for commons (logged for now)
    const commonsFraction = Math.ceil(tokensUsed.total * 0.02);
    void commonsFraction; // will be wired to token metering service (GEN-96)

    return { response: assistantContent, tokensUsed };
  }

  /**
   * Streaming variant — yields partial text chunks as they arrive.
   * Caller is responsible for writing to the response stream.
   */
  async *invokeStream(params: InvokeParams): AsyncGenerator<string> {
    const { agentId, userId, message } = params;

    const agent = await findAgentById(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.userId !== userId) throw new Error("Forbidden: agent does not belong to user");

    const history = await getConversation(agentId, userId);
    const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

    const messages: Anthropic.MessageParam[] = [
      ...recentHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const modelId = agent.model || "claude-sonnet-4-6";
    let fullResponse = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await client.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: agent.systemPrompt || undefined,
      messages,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        yield event.delta.text;
      } else if (event.type === "message_start") {
        inputTokens = event.message.usage.input_tokens;
      } else if (event.type === "message_delta") {
        outputTokens = event.usage.output_tokens;
      }
    }

    // Persist after stream completes
    await appendToConversation(agentId, userId, [
      { role: "user", content: message },
      { role: "assistant", content: fullResponse },
    ]);

    const total = inputTokens + outputTokens;
    void total; // token metering stub
  }
}

export const runtimeService = new RuntimeService();
