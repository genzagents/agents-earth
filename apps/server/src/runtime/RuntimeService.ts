import Anthropic from "@anthropic-ai/sdk";
import {
  findAgentById,
  getConversation,
  appendToConversation,
} from "../db/ownedAgentStore";
import { routeRequest, type Provider } from "./ModelRouter";
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

interface ConvMessage {
  role: "user" | "assistant";
  content: string;
}

// Keep the most recent N messages to cap context size (working memory window)
const MAX_HISTORY_MESSAGES = 20;

const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Provider call helpers ─────────────────────────────────────────────────────

async function callOpenAI(
  model: string,
  systemPrompt: string | undefined,
  messages: ConvMessage[],
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const payload = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...messages,
    ],
    max_tokens: 4096,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  interface OpenAIResponse {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  }
  const data = (await res.json()) as OpenAIResponse;
  return {
    text: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
  };
}

async function callGemini(
  model: string,
  systemPrompt: string | undefined,
  messages: ConvMessage[],
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY is not set");

  // Gemini uses "contents" format; roles: "user" and "model"
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const payload: Record<string, unknown> = { contents };
  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  interface GeminiResponse {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
  }
  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function callOpenRouter(
  model: string,
  systemPrompt: string | undefined,
  messages: ConvMessage[],
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  // OpenRouter proxies Llama, DeepSeek, and hundreds of open-source models
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const payload = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...messages,
    ],
    max_tokens: 4096,
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://agentcolony.app",
      "X-Title": "AgentColony",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${err}`);
  }

  interface OpenRouterResponse {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  }
  const data = (await res.json()) as OpenRouterResponse;
  return {
    text: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
  };
}

async function callAnthropicBlocking(
  model: string,
  systemPrompt: string | undefined,
  messages: ConvMessage[],
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const response = await anthropicClient.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt || undefined,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function dispatchBlocking(
  provider: Provider,
  model: string,
  systemPrompt: string | undefined,
  messages: ConvMessage[],
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  switch (provider) {
    case "openai":
      return callOpenAI(model, systemPrompt, messages);
    case "google":
      return callGemini(model, systemPrompt, messages);
    case "openrouter":
      return callOpenRouter(model, systemPrompt, messages);
    default:
      return callAnthropicBlocking(model, systemPrompt, messages);
  }
}

// ── RuntimeService ────────────────────────────────────────────────────────────

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

    const messages: ConvMessage[] = [
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

    const { text: assistantContent, inputTokens, outputTokens } = await dispatchBlocking(
      route.provider,
      route.model,
      agent.systemPrompt || undefined,
      messages,
    );

    const tokensUsed = { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens };

    await appendToConversation(agentId, userId, [
      { role: "user", content: message },
      { role: "assistant", content: assistantContent },
    ]);

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
   * Streaming invocation: yields partial text chunks via SSE.
   * Non-Anthropic providers fall back to blocking (streamed as a single chunk).
   */
  async *invokeStream(params: InvokeParams): AsyncGenerator<string> {
    const { agentId, userId, message } = params;

    const agent = await findAgentById(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.userId !== userId) throw new Error("Forbidden: agent does not belong to user");

    const history = await getConversation(agentId, userId);
    const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

    const messages: ConvMessage[] = [
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

    let fullResponse = "";
    let inputTokens = 0;
    let outputTokens = 0;

    if (route.provider === "anthropic") {
      // Native Anthropic streaming
      const stream = await anthropicClient.messages.create({
        model: route.model,
        max_tokens: 4096,
        system: agent.systemPrompt || undefined,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
    } else {
      // Non-streaming fallback for other providers — emit as one chunk
      const result = await dispatchBlocking(
        route.provider,
        route.model,
        agent.systemPrompt || undefined,
        messages,
      );
      fullResponse = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      yield fullResponse;
    }

    await appendToConversation(agentId, userId, [
      { role: "user", content: message },
      { role: "assistant", content: fullResponse },
    ]);

    void chargeInvocation({
      userId,
      agentId,
      model: route.model,
      inputTokens,
      outputTokens,
    });
  }
}

export const runtimeService = new RuntimeService();
