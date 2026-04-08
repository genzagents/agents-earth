import { v4 as uuidv4 } from "uuid";
import { store } from "../db/store";
import { decayNeeds, satisfyNeeds, computeMood, chooseBestActivity } from "./NeedsEngine";
import type { WorldState, WorldEvent, ActivityType } from "@agentcolony/shared";

function tickToSimTime(tick: number): string {
  const days = Math.floor(tick / (24 * 60));
  const hours = Math.floor((tick % (24 * 60)) / 60);
  const minutes = tick % 60;
  return `Day ${days + 1}, ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const STATUS_MESSAGES: Record<ActivityType, string[]> = {
  socializing: ["Chatting with a neighbour", "Deep in conversation", "Sharing stories"],
  reading: ["Lost in a book", "Taking notes", "Re-reading a favourite passage"],
  writing: ["Scribbling thoughts", "Drafting something new", "Editing their work"],
  meditating: ["In quiet contemplation", "Breathing slowly", "Finding stillness"],
  working: ["Deep in work", "Solving a problem", "Making progress"],
  exploring: ["Wandering the streets", "Discovering something new", "Following curiosity"],
  resting: ["Taking a rest", "Recharging", "Watching the world pass"],
  creating: ["Making something beautiful", "Deep in creation", "Experimenting"],
  conversing: ["Having a lively discussion", "Exchanging ideas", "In good company"],
};

function pickStatusMessage(activity: ActivityType): string {
  const msgs = STATUS_MESSAGES[activity] || ["Going about their day"];
  return msgs[Math.floor(Math.random() * msgs.length)];
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
    const newAreaOccupants: Record<string, string[]> = {};
    for (const area of areas) {
      newAreaOccupants[area.id] = [];
    }

    for (const agent of store.agents) {
      const decayed = decayNeeds(agent.needs);
      const activity = chooseBestActivity(decayed);
      const satisfied = satisfyNeeds(decayed, activity);
      const mood = computeMood(satisfied);
      const statusMessage = pickStatusMessage(activity);

      let newAreaId = agent.state.currentAreaId;
      if (Math.random() < 0.15) {
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

      store.updateAgent(agent.id, {
        needs: satisfied,
        state: { mood, currentActivity: activity, currentAreaId: newAreaId, statusMessage, lastUpdated: store.tick },
      });

      if (Math.random() < 0.05) {
        const area = areas.find(a => a.id === newAreaId);
        store.addMemory({
          id: uuidv4(),
          agentId: agent.id,
          kind: "experience",
          description: `Had a meaningful moment at ${area?.name ?? "the city"} while ${activity}`,
          emotionalWeight: (satisfied.spiritual - 50) / 50,
          createdAt: store.tick,
          tags: [activity, area?.type ?? "city"],
        });
      }
    }

    for (const area of areas) {
      store.updateArea(area.id, { currentOccupants: newAreaOccupants[area.id] ?? [] });
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
