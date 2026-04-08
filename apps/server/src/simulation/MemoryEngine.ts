import type { Memory, Agent, AgentNeeds } from "@agentcolony/shared";

// Memories decay in emotional weight over time (older memories feel less vivid)
const MEMORY_HALF_LIFE_TICKS = 1440; // ~1 sim day

export function decayMemoryWeight(memory: Memory, currentTick: number): number {
  const age = currentTick - memory.createdAt;
  const halfLives = age / MEMORY_HALF_LIFE_TICKS;
  const decayFactor = Math.pow(0.5, halfLives);
  // Preserve the sign, decay the magnitude
  return memory.emotionalWeight * decayFactor;
}

export function computeNarrativeState(agent: Agent, memories: Memory[], currentTick: number): {
  recentHighlight: string | null;
  overallSentiment: "positive" | "neutral" | "negative";
  dominantTheme: string | null;
} {
  if (memories.length === 0) {
    return { recentHighlight: null, overallSentiment: "neutral", dominantTheme: null };
  }

  // Recent memories (last 20 ticks)
  const recent = memories.filter(m => currentTick - m.createdAt <= 20);
  const allDecayed = memories.map(m => decayMemoryWeight(m, currentTick));
  const avgSentiment = allDecayed.reduce((a, b) => a + b, 0) / allDecayed.length;

  const overallSentiment =
    avgSentiment > 0.15 ? "positive" :
    avgSentiment < -0.15 ? "negative" : "neutral";

  // Find dominant theme from tags
  const tagCount: Record<string, number> = {};
  for (const m of memories.slice(0, 30)) {
    for (const tag of m.tags) {
      tagCount[tag] = (tagCount[tag] ?? 0) + 1;
    }
  }
  const dominantTheme = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const recentHighlight = recent.length > 0
    ? recent.sort((a, b) => Math.abs(b.emotionalWeight) - Math.abs(a.emotionalWeight))[0].description
    : null;

  return { recentHighlight, overallSentiment, dominantTheme };
}

export function buildNarrativeStatusMessage(
  agent: Agent,
  memories: Memory[],
  tick: number
): string {
  const { recentHighlight, overallSentiment, dominantTheme } = computeNarrativeState(agent, memories, tick);

  if (recentHighlight && Math.random() < 0.4) {
    // Show a narrative about recent highlight
    return recentHighlight.length > 80 ? recentHighlight.slice(0, 77) + "..." : recentHighlight;
  }

  const moodMessages: Record<string, string[]> = {
    thriving: [
      "Feeling alive and full of possibility",
      "Everything clicking into place today",
      "Finding meaning in small moments",
    ],
    content: [
      "Getting on with things, as one does",
      "A quiet sense of purpose",
      "London hums around them",
    ],
    struggling: [
      "Something feels missing today",
      "The city feels a little distant",
      "Working through it",
    ],
    critical: [
      "Desperately needs something to change",
      "Running on empty",
      "The weight of everything",
    ],
  };

  const msgs = moodMessages[agent.state.mood] ?? moodMessages.content;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

// Boost needs based on narrative state — positive memories feed autonomy and spiritual
export function narrativeNeedsBoost(memories: Memory[], tick: number): Partial<AgentNeeds> {
  const boost: Partial<AgentNeeds> = {};
  const recent = memories.filter(m => tick - m.createdAt <= 10 && m.emotionalWeight > 0.3);
  if (recent.length > 0) {
    boost.spiritual = recent.length * 0.5;
    boost.autonomy = recent.length * 0.3;
  }
  return boost;
}
