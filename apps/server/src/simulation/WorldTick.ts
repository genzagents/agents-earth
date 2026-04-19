import { v4 as uuidv4 } from "uuid";
import { store } from "../db/store";
import {
  decayNeeds,
  satisfyNeeds,
  computeMood,
  chooseBestActivityForArea,
  chooseDestinationArea,
} from "./NeedsEngine";
import { processSocialInteractions } from "./SocialEngine";
import { buildNarrativeStatusMessage, narrativeNeedsBoost } from "./MemoryEngine";
import { agentAgeInSimDays, applyAgingPressure, checkRetirement } from "./LegacyEngine";
import { agentBrain } from "./AgentBrain";
import { agentScheduler } from "./AgentScheduler";
import type { WorldState, WorldEvent, Agent } from "@agentcolony/shared";

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
    this.interval = setInterval(() => {
      try {
        this.runTick();
      } catch (err) {
        console.error("[WorldTick] Tick error:", err);
      }
    }, tickIntervalMs);
    this.saveInterval = setInterval(() => store.save(), 30_000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.saveInterval) clearInterval(this.saveInterval);
    agentScheduler.stopAll();
    store.save();
  }

  private runTick() {
    store.tick++;

    const areas = store.areas;
    const areaMap: Record<string, { name: string; type: string }> = {};
    for (const a of areas) areaMap[a.id] = { name: a.name, type: a.type };

    // Collect event kinds generated this tick for watch-trigger evaluation
    const tickEventKinds = new Set<string>();

    const newAreaOccupants: Record<string, string[]> = {};
    for (const area of areas) newAreaOccupants[area.id] = [];

    // --- Phase 1: Individual agent updates (skip retired agents) ---
    const updatedAgents: Agent[] = [];
    const conversationLines = new Map<string, string>();

    for (const agent of store.agents) {
      // Retired agents stay in the store but don't participate in ticks
      if (agent.isRetired) {
        updatedAgents.push(agent);
        continue;
      }

      const currentArea = areas.find(a => a.id === agent.state.currentAreaId);
      const areaType = currentArea?.type ?? "plaza";

      // Decay needs, then apply aging pressure for older agents
      let decayed = decayNeeds(agent.needs);
      const ageInDays = agentAgeInSimDays(agent, store.tick);
      decayed = applyAgingPressure(decayed, ageInDays);

      // Apply memory-based needs boost
      const agentMemories = store.getAgentMemories(agent.id);
      const memBoost = narrativeNeedsBoost(agentMemories, store.tick);
      for (const [k, v] of Object.entries(memBoost)) {
        const key = k as keyof typeof decayed;
        decayed[key] = Math.min(100, decayed[key] + (v ?? 0));
      }

      // Movement: 12% chance — need-aware via area affinity scoring
      // Decide movement BEFORE choosing activity so activity matches the final area
      let newAreaId = agent.state.currentAreaId;
      if (Math.random() < 0.12) {
        const targetArea = chooseDestinationArea(decayed, areas, agent.state.currentAreaId);
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
        tickEventKinds.add("movement");
      }

      // Choose activity based on the final area (after any movement)
      const finalAreaType = areas.find(a => a.id === newAreaId)?.type ?? "plaza";
      const activity = chooseBestActivityForArea(decayed, finalAreaType);
      const satisfied = satisfyNeeds(decayed, activity);

      const mood = computeMood(satisfied);

      // Get LLM-generated brain output (sync from cache; background refresh fires automatically)
      const brain = agentBrain.think(
        { ...agent, needs: satisfied, state: { ...agent.state, mood } },
        agentMemories
      );

      // Use LLM statusMessage if available, else fall back to template
      const statusMessage =
        brain.statusMessage ||
        buildNarrativeStatusMessage(
          { ...agent, needs: satisfied, state: { ...agent.state, mood } },
          agentMemories,
          store.tick
        );

      // Store conversation line for use in social interactions
      if (brain.conversationLine) {
        conversationLines.set(agent.id, brain.conversationLine);
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

    // --- Phase 2: Legacy — check retirements ---
    const livingAgentIds = updatedAgents.filter(a => !a.isRetired).map(a => a.id);
    for (const agent of updatedAgents) {
      if (agent.isRetired) continue;
      const result = checkRetirement(agent, store.tick, livingAgentIds);
      if (result) {
        store.updateAgent(agent.id, { isRetired: true, legacyNote: result.legacyNote });
        store.addEvent(result.event);
        for (const mem of result.legacyMemoriesForOthers) store.addMemory(mem);
      }
    }

    // --- Phase 3: Social interactions ---
    const agentsByArea: Record<string, Agent[]> = {};
    for (const agent of updatedAgents) {
      if (agent.isRetired) continue;
      const areaId = agent.state.currentAreaId;
      (agentsByArea[areaId] ??= []).push(agent);
    }
    const coLocatedGroups = Object.values(agentsByArea).filter(g => g.length >= 2);

    const { events: socialEvents, memories: socialMemories, needsBoosts, relationshipDeltas } =
      processSocialInteractions(coLocatedGroups, store.tick, areaMap, conversationLines);

    for (const evt of socialEvents) { store.addEvent(evt); tickEventKinds.add(evt.kind); }
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

    // Apply relationship deltas (bidirectional, already both directions from SocialEngine)
    for (const delta of relationshipDeltas) {
      store.updateAgentRelationship(delta.agentId, delta.targetAgentId, {
        interactionsDelta: delta.interactionsDelta,
        strengthDelta: delta.strengthDelta,
      });
    }

    // --- Phase 4: Always-on agent scheduler ---
    agentScheduler.tick(store.tick, tickEventKinds);

    // --- Phase 5: Maintenance — archive inactive working groups (once per sim day ~720 ticks) ---
    if (store.tick % 720 === 0) {
      store.archiveInactiveWorkingGroups();
    }


    this.onTickCallback?.(this.buildSnapshot());
  }

  private buildSnapshot(): WorldState {
    const agents = store.agents.map(agent => ({
      ...agent,
      reputationScore:
        agent.relationships.length + store.getAgentMemories(agent.id).length,
    }));
    return {
      tick: store.tick,
      simTime: tickToSimTime(store.tick),
      areas: store.areas,
      agents,
      recentEvents: store.getRecentEvents(20),
    };
  }

  getSnapshot(): WorldState {
    return this.buildSnapshot();
  }
}
