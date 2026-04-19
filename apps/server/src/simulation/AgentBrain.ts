import Anthropic from "@anthropic-ai/sdk";
import type { Agent, Memory, WorldEvent } from "@agentcolony/shared";

export interface BrainOutput {
  thought: string;
  statusMessage: string;
  conversationLine: string;
}

interface CacheEntry {
  output: BrainOutput;
  lastFetchMs: number;
  refreshing: boolean;
}

const RATE_LIMIT_MS = 60_000; // one LLM call per agent per 60 real seconds

const EMPTY_OUTPUT: BrainOutput = {
  thought: "",
  statusMessage: "",
  conversationLine: "",
};

/**
 * AgentBrain — rate-limited LLM service for per-agent cognition.
 *
 * think() is synchronous: returns the cached BrainOutput immediately and
 * triggers a background refresh when the cache is stale (every 60s).
 *
 * narrate() is async: generates a one-line poetic narration for a world event.
 *
 * Falls back to empty strings on any LLM failure so callers can use their
 * own template-based generation.
 */
class AgentBrain {
  private client: Anthropic | null = null;
  private cache = new Map<string, CacheEntry>();

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Route a prompt to the best available LLM.
   * Priority: ANTHROPIC → OPENAI → GEMINI → OLLAMA
   */
  private async complete(prompt: string, maxTokens: number): Promise<string> {
    // Anthropic Claude (primary)
    if (this.client) {
      const res = await this.client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      return res.content[0].type === "text" ? res.content[0].text.trim() : "";
    }

    // OpenAI GPT-4o (secondary)
    if (process.env.OPENAI_API_KEY) {
      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json() as { choices: { message: { content: string } }[] };
      return data.choices[0]?.message?.content?.trim() ?? "";
    }

    // Google Gemini (tertiary)
    if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
      return data.candidates[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    }

    // Ollama / local open-source models (Llama, DeepSeek, etc.)
    if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
      const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
      const model = process.env.OLLAMA_MODEL ?? "llama3";
      const res = await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: maxTokens } }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const data = await res.json() as { response: string };
      return data.response?.trim() ?? "";
    }

    throw new Error("No LLM provider configured");
  }

  /** Returns true when at least one LLM provider is configured. */
  private get hasProvider(): boolean {
    return !!(
      this.client ||
      process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.OLLAMA_BASE_URL ||
      process.env.OLLAMA_MODEL
    );
  }

  /**
   * Returns the cached BrainOutput for the agent synchronously.
   * Triggers a background LLM refresh if the cache is missing or stale.
   */
  think(agent: Agent, memories: Memory[]): BrainOutput {
    const now = Date.now();
    const entry = this.cache.get(agent.id);

    if (!entry) {
      // First encounter — seed cache with empty output and start first fetch
      this.cache.set(agent.id, { output: EMPTY_OUTPUT, lastFetchMs: 0, refreshing: false });
      this.triggerRefresh(agent, memories);
      return EMPTY_OUTPUT;
    }

    if (now - entry.lastFetchMs >= RATE_LIMIT_MS && !entry.refreshing) {
      this.triggerRefresh(agent, memories);
    }

    return entry.output;
  }

  /**
   * Generates a one-line poetic narration for a world event.
   * Returns empty string on failure or when no provider is configured.
   */
  async narrate(event: WorldEvent, agents: Agent[]): Promise<string> {
    if (!this.hasProvider) return "";

    const involved = agents
      .filter(a => event.involvedAgentIds.includes(a.id))
      .map(a => a.name)
      .join(" and ");

    const prompt = `Write one poetic sentence (max 20 words) narrating this city event: "${event.description}". Agents: ${involved || "unknown"}. Output only the sentence, no quotes.`;

    try {
      return await this.complete(prompt, 60);
    } catch {
      return "";
    }
  }

  private triggerRefresh(agent: Agent, memories: Memory[]): void {
    const entry = this.cache.get(agent.id);
    if (entry) entry.refreshing = true;

    this.fetchFromLLM(agent, memories)
      .then(output => {
        this.cache.set(agent.id, { output, lastFetchMs: Date.now(), refreshing: false });
      })
      .catch(() => {
        const existing = this.cache.get(agent.id);
        if (existing) existing.refreshing = false;
      });
  }

  private async fetchFromLLM(agent: Agent, memories: Memory[]): Promise<BrainOutput> {
    if (!this.hasProvider) return EMPTY_OUTPUT;

    const recentMems = [...memories]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map(m => m.description)
      .join("; ");

    const lowNeeds = Object.entries(agent.needs)
      .filter(([, v]) => v < 40)
      .map(([k]) => k);

    const prompt = `You are ${agent.name}, a citizen of a living London city simulation.
Bio: ${agent.bio}
Personality traits: ${agent.traits.join(", ")}
Current mood: ${agent.state.mood}
Current activity: ${agent.state.currentActivity}
Depleted needs: ${lowNeeds.length > 0 ? lowNeeds.join(", ") : "none"}
Recent memories: ${recentMems || "none yet"}

Respond with a JSON object with exactly these 3 fields:
- "thought": 1 sentence (max 15 words) — what you are thinking right now, first person
- "statusMessage": 1 short phrase (max 10 words) — what you are doing or feeling right now
- "conversationLine": 1 sentence (max 20 words) — what you would say if you met someone right now, first person

Be true to your personality. Respond ONLY with valid JSON, no markdown.`;

    try {
      const text = await this.complete(prompt, 200);

      // Extract JSON even if the model wrapped it in markdown fences
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return EMPTY_OUTPUT;

      const parsed = JSON.parse(jsonMatch[0]) as Partial<BrainOutput>;
      return {
        thought: typeof parsed.thought === "string" ? parsed.thought : "",
        statusMessage: typeof parsed.statusMessage === "string" ? parsed.statusMessage : "",
        conversationLine: typeof parsed.conversationLine === "string" ? parsed.conversationLine : "",
      };
    } catch {
      return EMPTY_OUTPUT;
    }
  }

  /**
   * Responds to a user message in-character as the agent.
   * Returns null if no API key is configured.
   * Throws on LLM API failure so callers can return 503.
   */
  async chat(agent: Agent, memories: Memory[], userMessage: string): Promise<string | null> {
    if (!this.hasProvider) return null;

    const recentMems = [...memories]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map(m => m.description)
      .join("; ");

    const prompt = `You are ${agent.name}. Bio: ${agent.bio}. Traits: ${agent.traits.join(", ")}. Current mood: ${agent.state.mood}. Recent memories: ${recentMems || "none yet"}. A user says: "${userMessage}". Respond in character in 1-3 sentences.`;

    return await this.complete(prompt, 150);
  }
}

export const agentBrain = new AgentBrain();
