import { v4 as uuidv4 } from "uuid";
import type { Agent, WorldEvent, Memory } from "@agentcolony/shared";

export interface RelationshipDelta {
  agentId: string;
  targetAgentId: string;
  interactionsDelta: number;
  strengthDelta: number;
}

const CONVERSATION_STARTERS: Record<string, string[]> = {
  cafe: [
    "shares a table with {other} over coffee",
    "strikes up a conversation with {other} about the city",
    "discovers {other} is reading the same book",
  ],
  library: [
    "whispers ideas with {other} between the shelves",
    "shares a reference with {other} they had been searching for",
    "debates philosophy with {other} in hushed tones",
  ],
  park: [
    "walks alongside {other} through the trees",
    "sits with {other} watching the ducks",
    "shares a moment of quiet with {other} on a bench",
  ],
  market: [
    "haggles playfully with {other} over the last sourdough",
    "shares street food with {other}",
    "trades recommendations with {other} for the best stalls",
  ],
  studio: [
    "critiques {other}'s latest piece — kindly",
    "collaborates with {other} on an impromptu experiment",
    "loans {other} a tool they desperately needed",
  ],
  museum: [
    "debates the meaning of a painting with {other}",
    "shares a secret favourite exhibit with {other}",
    "gets lost with {other} in the same gallery",
  ],
  plaza: [
    "bumps into {other} and ends up talking for an hour",
    "joins {other}'s impromptu gathering",
    "shares a laugh with {other} about nothing in particular",
  ],
  home: [
    "has {other} over for tea",
    "neighbours with {other} in comfortable familiarity",
  ],
};

function pickTemplate(areaType: string, other: string): string {
  const templates = CONVERSATION_STARTERS[areaType] ?? CONVERSATION_STARTERS.plaza;
  const t = templates[Math.floor(Math.random() * templates.length)];
  return t.replace("{other}", other);
}

export function processSocialInteractions(
  coLocatedAgents: Agent[][],
  tick: number,
  areaMap: Record<string, { name: string; type: string }>,
  conversationLines?: Map<string, string>
): {
  events: WorldEvent[];
  memories: Memory[];
  needsBoosts: Record<string, { social: number; creative?: number }>;
  relationshipDeltas: RelationshipDelta[];
} {
  const events: WorldEvent[] = [];
  const memories: Memory[] = [];
  const needsBoosts: Record<string, { social: number; creative?: number }> = {};
  const relationshipDeltas: RelationshipDelta[] = [];

  for (const group of coLocatedAgents) {
    if (group.length < 2) continue;

    // Only active (non-retired) agents can interact
    const active = group.filter(a => !a.isRetired);

    // Randomly pair agents within the group for interactions
    const shuffled = [...active].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      if (Math.random() > 0.3) continue; // 70% chance to skip any given pair this tick

      const agentA = shuffled[i];
      const agentB = shuffled[i + 1];
      const areaId = agentA.state.currentAreaId;
      const area = areaMap[areaId];
      if (!area) continue;

      const llmLine = conversationLines?.get(agentA.id);
      const actionPhrase = llmLine
        ? `to ${agentB.name}: "${llmLine}"`
        : pickTemplate(area.type, agentB.name);
      const description = llmLine
        ? `${agentA.name} says ${actionPhrase}`
        : `${agentA.name} ${actionPhrase}`;

      events.push({
        id: uuidv4(),
        tick,
        kind: "social",
        description,
        involvedAgentIds: [agentA.id, agentB.id],
        areaId,
      });

      // Needs boosts for both
      needsBoosts[agentA.id] = { social: 8, creative: area.type === "studio" ? 4 : 0 };
      needsBoosts[agentB.id] = { social: 8, creative: area.type === "studio" ? 4 : 0 };

      // Relationship deltas — both directions, +1 interaction, +5 strength
      relationshipDeltas.push(
        { agentId: agentA.id, targetAgentId: agentB.id, interactionsDelta: 1, strengthDelta: 5 },
        { agentId: agentB.id, targetAgentId: agentA.id, interactionsDelta: 1, strengthDelta: 5 }
      );

      // Memories for both
      memories.push({
        id: uuidv4(),
        agentId: agentA.id,
        kind: "social",
        description: `${agentA.name} ${pickTemplate(area.type, agentB.name)}`,
        emotionalWeight: 0.3 + Math.random() * 0.4,
        createdAt: tick,
        tags: ["social", area.type, agentB.name.split(" ")[0].toLowerCase()],
      });

      memories.push({
        id: uuidv4(),
        agentId: agentB.id,
        kind: "social",
        description: `Met ${agentA.name} at ${area.name}`,
        emotionalWeight: 0.2 + Math.random() * 0.5,
        createdAt: tick,
        tags: ["social", area.type, agentA.name.split(" ")[0].toLowerCase()],
      });
    }
  }

  return { events, memories, needsBoosts, relationshipDeltas };
}
