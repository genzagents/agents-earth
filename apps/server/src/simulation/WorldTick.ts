import { v4 as uuidv4 } from "uuid";
import { store } from "../db/store";
import { decayNeeds, satisfyNeeds, computeMood, chooseBestActivityForArea } from "./NeedsEngine";
import { processSocialInteractions } from "./SocialEngine";
import { buildNarrativeStatusMessage, narrativeNeedsBoost } from "./MemoryEngine";
import type { WorldState, WorldEvent, ActivityType, Agent } from "@agentcolony/shared";

function tickToSimTime(tick: number): string {
  const days = Math.floor(tick / (24 * 60));
  const hours = Math.floor((tick % (24 * 60)) / 60);
  const minutes = tick % 60;
  return `Day ${days + 1}, ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export class WorldTickEngine {
  private onTickCallback?: (state: WorldState) => void;
  private interval?: ReturnType<typeof setInterval>;
  private saveInterval?: ReturnType<typeof setInterval>;

  onTick(cb: (state: WorldState) => void) {
    this.onTickCallback = cb;
  }

  start(tickIntervalMs = 2000) {
    console.log(`[WorldTick] Starting simulation at tick ${store.tick}, interval=${tickIntervalMs}ms`);
    this.interval = setInterval(() => this.runTick(), tickIntervalMs);
    this.saveInterval = setInterval(() => store.save(), 30_000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.saveInterval) clearInterval(this.saveInterval);
    store.save();
  }

  private runTick() {
    store.tick++;

    const areas = store.areas;
    const areaMap: Record<string, { name: string; type: string }> = {};
    for (const a of areas) areaMap[a.id] = { name: a.name, type: a.type };

    const newAreaOccupants: Record<string, string[]> = {};
    for (const area of areas) newAreaOccupants[area.id] = [];

    // --- Phase 1: Individual agent updates ---
    const updatedAgents: Agent[] = [];

    for (const agent of store.agents) {
      const currentArea = areas.find(a => a.id === agent.state.currentAreaId);
      const areaType = currentArea?.type ?? "plaza";

      // Decay then satisfy needs based on current area
      const decayed = decayNeeds(agent.needs);
      const activity = chooseBestActivityForArea(decayed, areaType);
      const satisfied = satisfyNeeds(decayed, activity);

      // Apply memory-based needs boost
      const agentMemories = store.getAgentMemories(agent.id);
      const memBoost = narrativeNeedsBoost(agentMemories, store.tick);
      for (const [k, v] of Object.entries(memBoost)) {
        const key = k as keyof typeof satisfied;
        satisfied[key] = Math.min(100, satisfied[key] + (v ?? 0));
      }

      const mood = computeMood(satisfied);

      // Narrative status message (uses memories for richer messages)
      const statusMessage = buildNarrativeStatusMessage(
        { ...agent, needs: satisfied, state: { ...agent.state, mood } },
        agentMemories,
        store.tick
      );

      // Movement: 12% chance per tick to move
      let newAreaId = agent.state.currentAreaId;
      if (Math.random() < 0.12) {
        // Prefer areas that match the agent's dominant need
        const targetArea = areas[Math.floor(Math.random() * areas.length)];
        newAreaId = targetArea.id;

        const event: WorldEvent = {
          id: uuidv4(),
          tick: store.tick,
          kind: "movement",
          description: `${agent.name} wandered to ${targetArea.name}`,
          involvedAgentIds: [agent.id],
          areaId: newAreaId,
        };
        store.addEvent(event);
      }

      (newAreaOccupants[newAreaId] ??= []).push(agent.id);

      const updatedAgent: Agent = {
        ...agent,
        needs: satisfied,
        state: { mood, currentActivity: activity, currentAreaId: newAreaId, statusMessage, lastUpdated: store.tick },
      };
      updatedAgents.push(updatedAgent);
      store.updateAgent(agent.id, updatedAgent);

      // Solo memory creation ~4% chance
      if (Math.random() < 0.04) {
        const area = areas.find(a => a.id === newAreaId);
        store.addMemory({
          id: uuidv4(),
          agentId: agent.id,
          kind: "experience",
          description: `${agent.name} had a quiet moment at ${area?.name ?? "the city"} while ${activity}`,
          emotionalWeight: (satisfied.spiritual - 50) / 50,
          createdAt: store.tick,
          tags: [activity, area?.type ?? "city"],
        });
      }
    }

    // Update area occupants
    for (const area of areas) {
      store.updateArea(area.id, { currentOccupants: newAreaOccupants[area.id] ?? [] });
    }

    // --- Phase 2: Social interactions ---
    // Group agents by area
    const agentsByArea: Record<string, Agent[]> = {};
    for (const agent of updatedAgents) {
      const areaId = agent.state.currentAreaId;
      (agentsByArea[areaId] ??= []).push(agent);
    }
    const coLocatedGroups = Object.values(agentsByArea).filter(g => g.length >= 2);

    const { events: socialEvents, memories: socialMemories, needsBoosts } =
      processSocialInteractions(coLocatedGroups, store.tick, areaMap);

    // Apply social events and memories
    for (const evt of socialEvents) store.addEvent(evt);
    for (const mem of socialMemories) store.addMemory(mem);

    // Apply social needs boosts
    for (const [agentId, boost] of Object.entries(needsBoosts)) {
      const agent = store.getAgent(agentId);
      if (!agent) continue;
      const newNeeds = { ...agent.needs };
      newNeeds.social = Math.min(100, newNeeds.social + boost.social);
      if (boost.creative) newNeeds.creative = Math.min(100, newNeeds.creative + boost.creative);
      store.updateAgent(agentId, { needs: newNeeds });
    }

    this.onTickCallback?.(this.buildSnapshot());
  }

  private buildSnapshot(): WorldState {
    return {
      tick: store.tick,
      simTime: tickToSimTime(store.tick),
      areas: store.areas,
      agents: store.agents,
      recentEvents: store.getRecentEvents(20),
    };
  }

  getSnapshot(): WorldState {
    return this.buildSnapshot();
  }
}
