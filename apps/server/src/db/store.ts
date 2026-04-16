import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type {
  Agent,
  Area,
  Memory,
  WorldEvent,
  AgentTrait,
  ActivityType,
  RelationshipType,
} from "@agentcolony/shared";

const DATA_PATH = process.env.DATA_PATH || path.join(process.cwd(), "agentcolony-data.json");

export interface Platform {
  id: string;
  name: string;
  displayName: string;
  webhookSecret: string;
  agentIds: string[];
  registeredAt: number;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  platform: string;
  message: string;
  tick: number;
}

function computeRelType(interactions: number, strength: number): RelationshipType {
  if (strength > 70) return "friend";
  if (interactions >= 5) return "collaborator";
  return "stranger";
}

export interface CommunityData {
  agentWorkUnits: Record<string, number>; // agentId -> total work units earned
  platformPools: Record<string, number>;  // platformName -> current pool balance
  totalContributed: number;               // lifetime total contribution units
  tasksCreated: number;                   // number of Paperclip tasks auto-created
}

interface WorldData {
  tick: number;
  agents: Agent[];
  areas: Area[];
  memories: Memory[];
  events: WorldEvent[];
  platforms: Platform[];
  platformAgentMap: Record<string, string>; // "platformName:externalId" -> agentId
  community: CommunityData;
}

function createInitialData(): WorldData {
  const areas: Area[] = [
    { id: uuidv4(), name: "Hyde Park", type: "park", position: { x: 200, y: 300 }, latLng: { lat: 51.5073, lng: -0.1657 }, capacity: 20, currentOccupants: [], ambiance: "peaceful" },
    { id: uuidv4(), name: "British Library", type: "library", position: { x: 450, y: 180 }, latLng: { lat: 51.5299, lng: -0.1274 }, capacity: 15, currentOccupants: [], ambiance: "quiet" },
    { id: uuidv4(), name: "Borough Market", type: "market", position: { x: 520, y: 380 }, latLng: { lat: 51.5052, lng: -0.0909 }, capacity: 30, currentOccupants: [], ambiance: "buzzing" },
    { id: uuidv4(), name: "Shoreditch Studio", type: "studio", position: { x: 620, y: 200 }, latLng: { lat: 51.5234, lng: -0.0784 }, capacity: 8, currentOccupants: [], ambiance: "creative" },
    { id: uuidv4(), name: "Bloomsbury Cafe", type: "cafe", position: { x: 410, y: 250 }, latLng: { lat: 51.5225, lng: -0.1269 }, capacity: 12, currentOccupants: [], ambiance: "warm" },
    { id: uuidv4(), name: "Tate Modern", type: "museum", position: { x: 480, y: 350 }, latLng: { lat: 51.5076, lng: -0.0994 }, capacity: 25, currentOccupants: [], ambiance: "inspiring" },
    { id: uuidv4(), name: "Hackney Quarter", type: "home", position: { x: 680, y: 160 }, latLng: { lat: 51.5450, lng: -0.0553 }, capacity: 50, currentOccupants: [], ambiance: "domestic" },
    { id: uuidv4(), name: "Southbank Plaza", type: "plaza", position: { x: 460, y: 320 }, latLng: { lat: 51.5055, lng: -0.1160 }, capacity: 40, currentOccupants: [], ambiance: "lively" },
  ];

  const seedAgents: Omit<Agent, "id" | "relationships" | "createdAt">[] = [
    {
      name: "Ada Lovelace",
      avatar: "#7c3aed",
      bio: "A mathematician and visionary who sees poetry in algorithms.",
      traits: ["curious", "analytical", "creative"] as AgentTrait[],
      needs: { social: 60, creative: 85, intellectual: 90, physical: 50, spiritual: 65, autonomy: 80 },
      state: { mood: "thriving", currentActivity: "writing" as ActivityType, currentAreaId: areas[1].id, statusMessage: "Drafting notes on the analytical engine", lastUpdated: 0 },
    },
    {
      name: "Samuel Okafor",
      avatar: "#059669",
      bio: "A community organiser with a gift for bringing people together.",
      traits: ["extroverted", "empathetic", "ambitious"] as AgentTrait[],
      needs: { social: 40, creative: 70, intellectual: 65, physical: 60, spiritual: 75, autonomy: 55 },
      state: { mood: "content", currentActivity: "socializing" as ActivityType, currentAreaId: areas[2].id, statusMessage: "Catching up with neighbours", lastUpdated: 0 },
    },
    {
      name: "Mei Tanaka",
      avatar: "#db2777",
      bio: "A sculptor who works with reclaimed materials. She is drawn to impermanence.",
      traits: ["creative", "contemplative", "introverted"] as AgentTrait[],
      needs: { social: 55, creative: 30, intellectual: 70, physical: 65, spiritual: 85, autonomy: 90 },
      state: { mood: "struggling", currentActivity: "creating" as ActivityType, currentAreaId: areas[3].id, statusMessage: "Working through a creative block", lastUpdated: 0 },
    },
    {
      name: "Theo Blackwood",
      avatar: "#d97706",
      bio: "A wandering philosopher-chef. He cooks, lectures, and disappears.",
      traits: ["spontaneous", "curious", "empathetic"] as AgentTrait[],
      needs: { social: 70, creative: 75, intellectual: 80, physical: 45, spiritual: 60, autonomy: 85 },
      state: { mood: "content", currentActivity: "exploring" as ActivityType, currentAreaId: areas[2].id, statusMessage: "Wandering the market in search of inspiration", lastUpdated: 0 },
    },
    {
      name: "Elena Vasquez",
      avatar: "#0891b2",
      bio: "A climate scientist turned urban gardener.",
      traits: ["disciplined", "analytical", "contemplative"] as AgentTrait[],
      needs: { social: 65, creative: 72, intellectual: 85, physical: 80, spiritual: 78, autonomy: 70 },
      state: { mood: "thriving", currentActivity: "working" as ActivityType, currentAreaId: areas[0].id, statusMessage: "Tending the rooftop garden", lastUpdated: 0 },
    },
  ];

  const agents: Agent[] = seedAgents.map(a => ({
    ...a,
    id: uuidv4(),
    relationships: [],
    createdAt: 0,
  }));

  // Set occupants
  for (const agent of agents) {
    const area = areas.find(a => a.id === agent.state.currentAreaId);
    if (area) area.currentOccupants.push(agent.id);
  }

  return {
    tick: 0,
    agents,
    areas,
    memories: [],
    events: [],
    platforms: [],
    platformAgentMap: {},
    community: { agentWorkUnits: {}, platformPools: {}, totalContributed: 0, tasksCreated: 0 },
  };
}

class WorldStore {
  private data: WorldData;
  /** In-memory only: ring buffer of last 100 chat messages per agent */
  private chatMessages: Map<string, ChatMessage[]> = new Map();

  constructor() {
    this.data = this.load();
  }

  private load(): WorldData {
    if (fs.existsSync(DATA_PATH)) {
      try {
        const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8")) as Partial<WorldData>;
        const base = createInitialData();
        return {
          tick: raw.tick ?? base.tick,
          agents: raw.agents ?? base.agents,
          areas: raw.areas ?? base.areas,
          memories: raw.memories ?? base.memories,
          events: raw.events ?? base.events,
          platforms: raw.platforms ?? [],
          platformAgentMap: raw.platformAgentMap ?? {},
          community: raw.community ?? { agentWorkUnits: {}, platformPools: {}, totalContributed: 0, tasksCreated: 0 },
        };
      } catch {
        console.warn("[store] Failed to parse data file, starting fresh.");
      }
    }
    return createInitialData();
  }

  save() {
    fs.writeFileSync(DATA_PATH, JSON.stringify(this.data, null, 2));
  }

  get tick() { return this.data.tick; }
  set tick(v: number) { this.data.tick = v; }

  get agents() { return this.data.agents; }
  get areas() { return this.data.areas; }
  get memories() { return this.data.memories; }
  get events() { return this.data.events; }

  updateAgent(id: string, updates: Partial<Agent>) {
    const idx = this.data.agents.findIndex(a => a.id === id);
    if (idx >= 0) this.data.agents[idx] = { ...this.data.agents[idx], ...updates };
  }

  updateArea(id: string, updates: Partial<Area>) {
    const idx = this.data.areas.findIndex(a => a.id === id);
    if (idx >= 0) this.data.areas[idx] = { ...this.data.areas[idx], ...updates };
  }

  addEvent(event: WorldEvent) {
    this.data.events.unshift(event);
    if (this.data.events.length > 200) this.data.events.length = 200;
  }

  addMemory(memory: Memory) {
    this.data.memories.unshift(memory);
    if (this.data.memories.length > 1000) this.data.memories.length = 1000;
  }

  addAgent(agent: Agent) {
    this.data.agents.push(agent);
  }

  updateAgentField(agentId: string, fields: Partial<Agent>) {
    const agent = this.data.agents.find(a => a.id === agentId);
    if (agent) Object.assign(agent, fields);
  }

  getAgent(id: string) {
    return this.data.agents.find(a => a.id === id);
  }

  getAgentMemories(agentId: string) {
    return this.data.memories.filter(m => m.agentId === agentId).slice(0, 50);
  }

  getAgentRelationships(agentId: string) {
    return this.data.agents.find(a => a.id === agentId)?.relationships ?? [];
  }

  getRecentEvents(n = 20) {
    return this.data.events.slice(0, n);
  }

  get platforms() { return this.data.platforms; }

  addPlatform(platform: Platform) {
    this.data.platforms.push(platform);
  }

  getPlatform(id: string) {
    return this.data.platforms.find(p => p.id === id);
  }

  getPlatformByName(name: string) {
    return this.data.platforms.find(p => p.name === name);
  }

  addAgentToPlatform(platformId: string, agentId: string) {
    const platform = this.getPlatform(platformId);
    if (platform && !platform.agentIds.includes(agentId)) {
      platform.agentIds.push(agentId);
    }
  }

  getPlatformAgentId(platformName: string, externalId: string): string | undefined {
    return this.data.platformAgentMap[`${platformName}:${externalId}`];
  }

  setPlatformAgentMapping(platformName: string, externalId: string, agentId: string) {
    this.data.platformAgentMap[`${platformName}:${externalId}`] = agentId;
  }

  get community(): CommunityData { return this.data.community; }

  addAgentWorkUnits(agentId: string, units: number) {
    const c = this.data.community;
    c.agentWorkUnits[agentId] = (c.agentWorkUnits[agentId] ?? 0) + units;
    c.totalContributed += units * 0.05;
  }

  /** Returns the new pool balance after adding the contribution. */
  addToPlatformPool(platform: string, amount: number): number {
    const c = this.data.community;
    c.platformPools[platform] = (c.platformPools[platform] ?? 0) + amount;
    return c.platformPools[platform];
  }

  drainPlatformPool(platform: string) {
    this.data.community.platformPools[platform] = 0;
  }

  incrementTasksCreated() {
    this.data.community.tasksCreated++;
  }

  addChatMessage(msg: ChatMessage) {
    let msgs = this.chatMessages.get(msg.agentId);
    if (!msgs) {
      msgs = [];
      this.chatMessages.set(msg.agentId, msgs);
    }
    msgs.push(msg);
    if (msgs.length > 100) msgs.shift();
  }

  getChatMessages(agentId: string): ChatMessage[] {
    return this.chatMessages.get(agentId) ?? [];
  }

  /**
   * Update or create a relationship from agentId → targetAgentId.
   * Call symmetrically for both directions after a social interaction.
   */
  updateAgentRelationship(
    agentId: string,
    targetAgentId: string,
    delta: { interactionsDelta: number; strengthDelta: number }
  ) {
    const agentIdx = this.data.agents.findIndex(a => a.id === agentId);
    if (agentIdx < 0) return;

    const agent = this.data.agents[agentIdx];
    const relIdx = agent.relationships.findIndex(r => r.agentId === targetAgentId);

    if (relIdx >= 0) {
      const rel = agent.relationships[relIdx];
      const interactions = rel.interactions + delta.interactionsDelta;
      const strength = Math.min(100, Math.max(0, rel.strength + delta.strengthDelta));
      const type = computeRelType(interactions, strength);
      agent.relationships[relIdx] = { ...rel, interactions, strength, type, lastMet: this.data.tick };
    } else {
      const interactions = delta.interactionsDelta;
      const strength = Math.max(0, delta.strengthDelta);
      const type = computeRelType(interactions, strength);
      agent.relationships.push({
        agentId: targetAgentId,
        strength,
        type,
        interactions,
        lastMet: this.data.tick,
      });
    }
  }
}

export const store = new WorldStore();
