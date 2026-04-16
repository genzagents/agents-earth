/**
 * Model Router — picks the best LLM for a given agent + task.
 *
 * Routing precedence:
 * 1. Agent's pinned model (agent.model !== "auto") → use as-is
 * 2. "auto" → analyse task type and pick based on heuristics
 *
 * Supported providers (Phase 1 — Anthropic only; others stubbed):
 * - Anthropic Claude (claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5-20251001)
 * - GPT-4o (stub — returns endpoint config, caller needs OpenAI SDK)
 * - Gemini (stub — long-context tasks)
 *
 * Cost tier (tokens/£, approximate):
 *   haiku   — cheapest  (<50 words, simple Q&A)
 *   sonnet  — balanced  (most tasks)
 *   opus    — expensive (complex reasoning, long analysis)
 */

export type Provider = "anthropic" | "openai" | "google";

export interface RouteResult {
  provider: Provider;
  model: string;
  endpoint?: string; // only set for non-Anthropic providers
}

interface TaskHints {
  messageLength: number;       // chars in user message
  historyLength: number;       // turns in conversation
  systemPromptLength: number;  // chars in system prompt
}

const ANTHROPIC_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
  // Legacy aliases
  "claude-3-5-sonnet-20241022",
  "claude-3-opus-20240229",
  "claude-3-haiku-20240307",
]);

const OPENAI_MODELS = new Set(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]);
const GOOGLE_MODELS = new Set(["gemini-1.5-pro", "gemini-2.0-flash-exp"]);

function pickAutoModel(hints: TaskHints): RouteResult {
  const totalContext = hints.messageLength + hints.historyLength * 200 + hints.systemPromptLength;

  // Very long context → Gemini (stub, falls back to Claude Sonnet until integrated)
  if (totalContext > 100_000) {
    // TODO: integrate Gemini API key. Fall back to sonnet for now.
    return { provider: "anthropic", model: "claude-sonnet-4-6" };
  }

  // Short, simple messages → Haiku (cheapest)
  if (hints.messageLength < 200 && hints.historyLength < 3) {
    return { provider: "anthropic", model: "claude-haiku-4-5-20251001" };
  }

  // Default: Sonnet (best balance of cost/quality)
  return { provider: "anthropic", model: "claude-sonnet-4-6" };
}

export function routeRequest(
  agentModel: string,
  hints: TaskHints
): RouteResult {
  const model = (agentModel || "claude-sonnet-4-6").toLowerCase();

  if (model === "auto") {
    return pickAutoModel(hints);
  }

  if (ANTHROPIC_MODELS.has(model)) {
    return { provider: "anthropic", model };
  }

  if (OPENAI_MODELS.has(model)) {
    return {
      provider: "openai",
      model,
      endpoint: "https://api.openai.com/v1/chat/completions",
    };
  }

  if (GOOGLE_MODELS.has(model)) {
    return {
      provider: "google",
      model,
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    };
  }

  // Unknown model — default to Sonnet
  return { provider: "anthropic", model: "claude-sonnet-4-6" };
}
