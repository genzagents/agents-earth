import Anthropic from "@anthropic-ai/sdk";
import {
  findAgentById,
  getConversation,
  appendToConversation,
} from "../db/ownedAgentStore";
import { routeRequest } from "./ModelRouter";
import { chargeInvocation } from "../billing/TokenMeter";

export interface InvokeParams {
  agentId: string;
  userId: string;
  message: string;
}

export interface InvokeResult {
  response: string;
  tokensUsed: { input: number; output: number; total: number };
}

// Keep the most recent N messages to cap context size (working memory window)
const MAX_HISTORY_MESSAGES = 20;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export class RuntimeService {
  /**
   * Blocking invocation: sends message to agent, returns full response.
   */
  async invoke(params: InvokeParams): Promise<InvokeResult> {
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

    const route = routeRequest(agent.model, {
      messageLength: message.length,
      historyLength: recentHistory.length,
      systemPromptLength: (agent.systemPrompt || "").length,
    });

    const response = await client.messages.create({
      model: route.model,
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

    await appendToConversation(agentId, userId, [
      { role: "user", content: message },
      { role: "assistant", content: assistantContent },
    ]);

    // Token metering: deduct credits + earmark 2% for commons
    await chargeInvocation({
      userId,
      agentId,
      model: route.model,
      inputTokens: tokensUsed.input,
      outputTokens: tokensUsed.output,
    });

    return { response: assistantContent, tokensUsed };
  }

  /**
   * Streaming invocation: yields partial text chunks as they arrive via SSE.
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

    const streamRoute = routeRequest(agent.model, {
      messageLength: message.length,
      historyLength: recentHistory.length,
      systemPromptLength: (agent.systemPrompt || "").length,
    });

    let fullResponse = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await client.messages.create({
      model: streamRoute.model,
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

    await appendToConversation(agentId, userId, [
      { role: "user", content: message },
      { role: "assistant", content: fullResponse },
    ]);

    void (inputTokens + outputTokens); // token metering stub (GEN-96)
  }
}

export const runtimeService = new RuntimeService();
