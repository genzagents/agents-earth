import { v4 as uuidv4 } from "uuid";
import type { Agent, AgentNeeds, WorldEvent, Memory } from "@agentcolony/shared";

// 1 sim day = 1440 ticks (same formula as tickToSimTime: days = tick / (24*60))
const TICKS_PER_SIM_DAY = 1440;
const AGING_PRESSURE_DAYS = 10;
const RETIREMENT_DAYS = 15;
const RETIREMENT_CHANCE_PER_TICK = 0.02; // 2% per tick once eligible

const LEGACY_NOTES: string[] = [
  "left behind a sense that the world is richer for their having wandered through it.",
  "departed quietly, leaving the faintest trace of something meaningful.",
  "retired from the city, their presence still felt in the corners they once loved.",
  "stepped back from the world, their story becoming part of the city's memory.",
  "found their peace and withdrew — their legacy now a whisper in every conversation.",
];

const LEGACY_DISCOVERY_MESSAGES = (retiredName: string, note: string): string[] => [
  `Heard something about ${retiredName}, who ${note}`,
  `${retiredName}'s story drifted into mind — someone who ${note}`,
  `A memory of ${retiredName} surfaced — they ${note}`,
];

/** Extra need decay multipliers applied to aging agents (10+ sim days old) */
const AGING_EXTRA_DECAY: Partial<AgentNeeds> = {
  social: 0.3,
  spiritual: 0.2,
};

/** Returns agent age in sim days */
export function agentAgeInSimDays(agent: Agent, currentTick: number): number {
  return (currentTick - agent.createdAt) / TICKS_PER_SIM_DAY;
}

/**
 * Apply extra need decay for aging agents (10+ sim days old).
 * Call this after the standard NeedsEngine decay.
 */
export function applyAgingPressure(needs: AgentNeeds, ageInDays: number): AgentNeeds {
  if (ageInDays < AGING_PRESSURE_DAYS) return needs;

  const updated = { ...needs };
  for (const [key, extra] of Object.entries(AGING_EXTRA_DECAY)) {
    const k = key as keyof AgentNeeds;
    updated[k] = Math.max(0, updated[k] - (extra ?? 0));
  }
  return updated;
}

export interface RetirementResult {
  event: WorldEvent;
  legacyMemoriesForOthers: Memory[];
  legacyNote: string;
}

/**
 * Check if an agent should retire this tick.
 * Eligible if: 15+ sim days old AND mood is "critical".
 * Returns null if the agent should not retire.
 */
export function checkRetirement(
  agent: Agent,
  currentTick: number,
  livingAgentIds: string[]
): RetirementResult | null {
  if (agent.isRetired) return null;

  const ageInDays = agentAgeInSimDays(agent, currentTick);
  if (ageInDays < RETIREMENT_DAYS) return null;
  if (agent.state.mood !== "critical") return null;
  if (Math.random() > RETIREMENT_CHANCE_PER_TICK) return null;

  const note = LEGACY_NOTES[Math.floor(Math.random() * LEGACY_NOTES.length)];

  const event: WorldEvent = {
    id: uuidv4(),
    tick: currentTick,
    kind: "legacy",
    description: `${agent.name} has retired from the simulation. They ${note}`,
    involvedAgentIds: [agent.id],
    areaId: agent.state.currentAreaId,
  };

  // Create a legacy memory for each living agent to discover
  const legacyMemoriesForOthers: Memory[] = livingAgentIds
    .filter(id => id !== agent.id)
    .map(recipientId => {
      const msgs = LEGACY_DISCOVERY_MESSAGES(agent.name, note);
      return {
        id: uuidv4(),
        agentId: recipientId,
        kind: "legacy" as const,
        description: msgs[Math.floor(Math.random() * msgs.length)],
        emotionalWeight: 0.4 + Math.random() * 0.3,
        createdAt: currentTick,
        tags: ["legacy", agent.name.split(" ")[0].toLowerCase(), "memory"],
      };
    });

  return { event, legacyMemoriesForOthers, legacyNote: note };
}
