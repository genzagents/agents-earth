import { v4 as uuidv4 } from "uuid";
import { pool } from "./pgClient";
import type {
  Agent,
  Area,
  CityInfo,
  Memory,
  WorldEvent,
  AgentTrait,
  ActivityType,
  RelationshipType,
} from "@agentcolony/shared";

export const CITIES: CityInfo[] = [
  {
    slug: "london",
    name: "London",
    center: { lat: 51.5074, lng: -0.1278 },
    description: "The original AgentColony — a dense, creative hub of minds old and new.",
  },
  {
    slug: "tokyo",
    name: "Tokyo",
    center: { lat: 35.6762, lng: 139.6503 },
    description: "A hyper-connected colony where tradition and innovation coexist.",
  },
];

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

const SINGLETON_ID = "singleton";

function createInitialData(): WorldData {
  const londonAreas: Area[] = [
    { id: uuidv4(), city: "london", name: "Hyde Park", type: "park", position: { x: 200, y: 300 }, latLng: { lat: 51.5073, lng: -0.1657 }, capacity: 20, currentOccupants: [], ambiance: "peaceful" },
    { id: uuidv4(), city: "london", name: "British Library", type: "library", position: { x: 450, y: 180 }, latLng: { lat: 51.5299, lng: -0.1274 }, capacity: 15, currentOccupants: [], ambiance: "quiet" },
    { id: uuidv4(), city: "london", name: "Borough Market", type: "market", position: { x: 520, y: 380 }, latLng: { lat: 51.5052, lng: -0.0909 }, capacity: 30, currentOccupants: [], ambiance: "buzzing" },
    { id: uuidv4(), city: "london", name: "Shoreditch Studio", type: "studio", position: { x: 620, y: 200 }, latLng: { lat: 51.5234, lng: -0.0784 }, capacity: 8, currentOccupants: [], ambiance: "creative" },
    { id: uuidv4(), city: "london", name: "Bloomsbury Cafe", type: "cafe", position: { x: 410, y: 250 }, latLng: { lat: 51.5225, lng: -0.1269 }, capacity: 12, currentOccupants: [], ambiance: "warm" },
    { id: uuidv4(), city: "london", name: "Tate Modern", type: "museum", position: { x: 480, y: 350 }, latLng: { lat: 51.5076, lng: -0.0994 }, capacity: 25, currentOccupants: [], ambiance: "inspiring" },
    { id: uuidv4(), city: "london", name: "Hackney Quarter", type: "home", position: { x: 680, y: 160 }, latLng: { lat: 51.5450, lng: -0.0553 }, capacity: 50, currentOccupants: [], ambiance: "domestic" },
    { id: uuidv4(), city: "london", name: "Southbank Plaza", type: "plaza", position: { x: 460, y: 320 }, latLng: { lat: 51.5055, lng: -0.1160 }, capacity: 40, currentOccupants: [], ambiance: "lively" },
  ];

  const tokyoAreas: Area[] = [
    { id: uuidv4(), city: "tokyo", name: "Ueno Park", type: "park", position: { x: 200, y: 300 }, latLng: { lat: 35.7146, lng: 139.7713 }, capacity: 25, currentOccupants: [], ambiance: "serene" },
    { id: uuidv4(), city: "tokyo", name: "Shibuya Crossing", type: "plaza", position: { x: 460, y: 320 }, latLng: { lat: 35.6595, lng: 139.7004 }, capacity: 50, currentOccupants: [], ambiance: "electric" },
    { id: uuidv4(), city: "tokyo", name: "Akihabara Lab", type: "studio", position: { x: 620, y: 200 }, latLng: { lat: 35.7022, lng: 139.7741 }, capacity: 10, currentOccupants: [], ambiance: "inventive" },
    { id: uuidv4(), city: "tokyo", name: "Tsukiji Outer Market", type: "market", position: { x: 520, y: 380 }, latLng: { lat: 35.6654, lng: 139.7707 }, capacity: 30, currentOccupants: [], ambiance: "vibrant" },
    { id: uuidv4(), city: "tokyo", name: "Yanaka Library", type: "library", position: { x: 450, y: 180 }, latLng: { lat: 35.7269, lng: 139.7702 }, capacity: 12, currentOccupants: [], ambiance: "contemplative" },
    { id: uuidv4(), city: "tokyo", name: "Shimokitazawa Cafe", type: "cafe", position: { x: 410, y: 250 }, latLng: { lat: 35.6614, lng: 139.6687 }, capacity: 10, currentOccupants: [], ambiance: "bohemian" },
    { id: uuidv4(), city: "tokyo", name: "Shinjuku Residences", type: "home", position: { x: 680, y: 160 }, latLng: { lat: 35.6938, lng: 139.7034 }, capacity: 40, currentOccupants: [], ambiance: "busy" },
  ];

  const areas: Area[] = [...londonAreas, ...tokyoAreas];

  const londonSeedAgents: Omit<Agent, "id" | "relationships" | "createdAt">[] = [
    {
      name: "Ada Lovelace",
      avatar: "#7c3aed",
      bio: "A mathematician and visionary who sees poetry in algorithms.",
      traits: ["curious", "analytical", "creative"] as AgentTrait[],
      needs: { social: 60, creative: 85, intellectual: 90, physical: 50, spiritual: 65, autonomy: 80 },
      state: { mood: "thriving", currentActivity: "writing" as ActivityType, currentAreaId: londonAreas[1].id, statusMessage: "Drafting notes on the analytical engine", lastUpdated: 0 },
    },
    {
      name: "Samuel Okafor",
      avatar: "#059669",
      bio: "A community organiser with a gift for bringing people together.",
      traits: ["extroverted", "empathetic", "ambitious"] as AgentTrait[],
      needs: { social: 40, creative: 70, intellectual: 65, physical: 60, spiritual: 75, autonomy: 55 },
      state: { mood: "content", currentActivity: "socializing" as ActivityType, currentAreaId: londonAreas[2].id, statusMessage: "Catching up with neighbours", lastUpdated: 0 },
    },
    {
      name: "Mei Tanaka",
      avatar: "#db2777",
      bio: "A sculptor who works with reclaimed materials. She is drawn to impermanence.",
      traits: ["creative", "contemplative", "introverted"] as AgentTrait[],
      needs: { social: 55, creative: 30, intellectual: 70, physical: 65, spiritual: 85, autonomy: 90 },
      state: { mood: "struggling", currentActivity: "creating" as ActivityType, currentAreaId: londonAreas[3].id, statusMessage: "Working through a creative block", lastUpdated: 0 },
    },
    {
      name: "Theo Blackwood",
      avatar: "#d97706",
      bio: "A wandering philosopher-chef. He cooks, lectures, and disappears.",
      traits: ["spontaneous", "curious", "empathetic"] as AgentTrait[],
      needs: { social: 70, creative: 75, intellectual: 80, physical: 45, spiritual: 60, autonomy: 85 },
      state: { mood: "content", currentActivity: "exploring" as ActivityType, currentAreaId: londonAreas[2].id, statusMessage: "Wandering the market in search of inspiration", lastUpdated: 0 },
    },
    {
      name: "Elena Vasquez",
      avatar: "#0891b2",
      bio: "A climate scientist turned urban gardener.",
      traits: ["disciplined", "analytical", "contemplative"] as AgentTrait[],
      needs: { social: 65, creative: 72, intellectual: 85, physical: 80, spiritual: 78, autonomy: 70 },
      state: { mood: "thriving", currentActivity: "working" as ActivityType, currentAreaId: londonAreas[0].id, statusMessage: "Tending the rooftop garden", lastUpdated: 0 },
    },
  ];

  const tokyoSeedAgents: Omit<Agent, "id" | "relationships" | "createdAt">[] = [
    {
      name: "Hiro Nakamura",
      avatar: "#f59e0b",
      bio: "A robotics engineer who believes machines should dream.",
      traits: ["curious", "analytical", "creative"] as AgentTrait[],
      needs: { social: 55, creative: 80, intellectual: 90, physical: 60, spiritual: 50, autonomy: 75 },
      state: { mood: "thriving", currentActivity: "working" as ActivityType, currentAreaId: tokyoAreas[2].id, statusMessage: "Debugging the latest prototype", lastUpdated: 0 },
    },
    {
      name: "Yuki Sato",
      avatar: "#10b981",
      bio: "A street photographer and part-time poet in love with city rhythms.",
      traits: ["creative", "spontaneous", "extroverted"] as AgentTrait[],
      needs: { social: 75, creative: 85, intellectual: 60, physical: 70, spiritual: 65, autonomy: 80 },
      state: { mood: "content", currentActivity: "exploring" as ActivityType, currentAreaId: tokyoAreas[1].id, statusMessage: "Chasing light through Shibuya", lastUpdated: 0 },
    },
    {
      name: "Kenji Watanabe",
      avatar: "#6366f1",
      bio: "A retired salaryman turned tea ceremony master.",
      traits: ["disciplined", "contemplative", "empathetic"] as AgentTrait[],
      needs: { social: 50, creative: 60, intellectual: 70, physical: 55, spiritual: 90, autonomy: 65 },
      state: { mood: "content", currentActivity: "meditating" as ActivityType, currentAreaId: tokyoAreas[0].id, statusMessage: "Finding stillness amid the city noise", lastUpdated: 0 },
    },
  ];

  const seedAgents = [...londonSeedAgents, ...tokyoSeedAgents];

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
  private data: WorldData = createInitialData();
  /** In-memory only: ring buffer of last 100 chat messages per agent */
  private chatMessages: Map<string, ChatMessage[]> = new Map();

  /** Must be called once at server startup (after runMigrations). */
  async init(): Promise<void> {
    const result = await pool.query<{ data: WorldData }>(
      "SELECT data FROM world_state WHERE id = $1",
      [SINGLETON_ID]
    );

    if (result.rows.length > 0) {
      const raw = result.rows[0].data as Partial<WorldData>;
      const base = createInitialData();
      this.data = {
        tick: raw.tick ?? base.tick,
        agents: raw.agents ?? base.agents,
        areas: raw.areas ?? base.areas,
        memories: raw.memories ?? base.memories,
        events: raw.events ?? base.events,
        platforms: raw.platforms ?? [],
        platformAgentMap: raw.platformAgentMap ?? {},
        community: raw.community ?? { agentWorkUnits: {}, platformPools: {}, totalContributed: 0, tasksCreated: 0 },
      };
      // Backfill city field for areas persisted before multi-city support
      for (const area of this.data.areas) {
        if (!area.city) (area as Area).city = "london";
      }
      // Seed Tokyo areas/agents if this is an existing DB with only London data
      const hasTokyoAreas = this.data.areas.some(a => a.city === "tokyo");
      if (!hasTokyoAreas) {
        const fresh = createInitialData();
        const tokyoAreas = fresh.areas.filter(a => a.city === "tokyo");
        const tokyoAgents = fresh.agents.filter(a => {
          const area = fresh.areas.find(ar => ar.id === a.state.currentAreaId);
          return area?.city === "tokyo";
        });
        this.data.areas.push(...tokyoAreas);
        this.data.agents.push(...tokyoAgents);
        await this.save();
      }
    } else {
      // First boot — persist initial seed data
      await this.save();
    }
  }

  async save(): Promise<void> {
    await pool.query(
      `INSERT INTO world_state (id, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()`,
      [SINGLETON_ID, JSON.stringify(this.data)]
    );
  }

  get tick() { return this.data.tick; }
  set tick(v: number) { this.data.tick = v; }

  get agents() { return this.data.agents; }
  get areas() { return this.data.areas; }
  get memories() { return this.data.memories; }
  get events() { return this.data.events; }

  getAreasByCity(city: string): Area[] {
    return this.data.areas.filter(a => a.city === city);
  }

  getAgentsByCity(city: string): Agent[] {
    const cityAreaIds = new Set(this.getAreasByCity(city).map(a => a.id));
    return this.data.agents.filter(a => cityAreaIds.has(a.state.currentAreaId));
  }

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
