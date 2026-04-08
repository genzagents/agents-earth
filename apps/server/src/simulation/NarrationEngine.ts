import type { WorldEvent, Agent, AgentMood } from "@agentcolony/shared";

/**
 * NarrationEngine — generates one-line poetic descriptions of notable world events.
 *
 * MVP: template-based narration.
 * Future: swap `generateLine` body for a local LLM call (Ollama / llama.cpp).
 */

const SOCIAL_NARRATIONS: string[] = [
  "Two souls find each other in the noise of the city.",
  "Connection, brief and luminous, before the city moves on.",
  "A conversation that neither will quite remember, but both will feel.",
  "The city grows smaller whenever two people choose to talk.",
  "Words pass between them like light through a half-open door.",
];

const MOVEMENT_NARRATIONS: string[] = [
  "Restlessness, or perhaps instinct — they are moving again.",
  "The city calls, and they answer without knowing why.",
  "A new corner. The same longing.",
  "Motion is its own kind of thought.",
  "They arrive somewhere. Whether it is where they meant to go is another question.",
];

const MOOD_NARRATIONS: Record<AgentMood, string[]> = {
  thriving: [
    "Something has shifted — they feel it before they can name it.",
    "A quiet radiance. The kind that needs no audience.",
    "For a moment, everything is exactly enough.",
  ],
  content: [
    "Not ecstatic, not lost. Simply present.",
    "Getting on with it. There is dignity in that.",
    "The city hums. They hum back.",
  ],
  struggling: [
    "The weight of things is heavy today.",
    "Something is missing, and they cannot quite say what.",
    "They are still here. That is not nothing.",
  ],
  critical: [
    "At the edge of something — they do not know which side they are on.",
    "The city has never felt so indifferent.",
    "Running on memory and the faint hope that tomorrow will differ.",
  ],
};

const LEGACY_NARRATIONS: string[] = [
  "A chapter ends. The city turns its page.",
  "They have gone, but the shape of them remains.",
  "Retirement is not an ending — it is a kind of permanence.",
  "The story does not stop. It only changes voice.",
  "What they left behind cannot be counted, only felt.",
];

const CREATION_NARRATIONS: string[] = [
  "Something new exists that did not before. That is enough.",
  "An act of making in a world that never stops unmaking.",
  "They have added something to the city's quiet collection.",
  "Art is a refusal to disappear entirely.",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a single poetic narration line for a world event.
 *
 * LLM HOOK: Replace this function body with an async LLM call when ready.
 * The prompt would be: "In one sentence, narrate this event poetically: {event.description}"
 */
export function generateNarration(event: WorldEvent, agents: Agent[]): string {
  switch (event.kind) {
    case "social":
      return pick(SOCIAL_NARRATIONS);
    case "movement":
      return pick(MOVEMENT_NARRATIONS);
    case "legacy":
      return pick(LEGACY_NARRATIONS);
    case "creation":
      return pick(CREATION_NARRATIONS);
    case "mood_change": {
      const agent = agents.find(a => event.involvedAgentIds.includes(a.id));
      const mood = agent?.state.mood ?? "content";
      return pick(MOOD_NARRATIONS[mood] ?? MOOD_NARRATIONS.content);
    }
    default:
      return "The simulation breathes. Tick by tick, it becomes.";
  }
}

/**
 * Select the most notable events from a tick for narration.
 * Returns up to `limit` events, prioritising social and legacy events.
 */
export function selectNotableEvents(events: WorldEvent[], limit = 3): WorldEvent[] {
  const priority = (e: WorldEvent): number => {
    if (e.kind === "legacy") return 3;
    if (e.kind === "social") return 2;
    if (e.kind === "mood_change") return 1;
    return 0;
  };
  return [...events].sort((a, b) => priority(b) - priority(a)).slice(0, limit);
}
