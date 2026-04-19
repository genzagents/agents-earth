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

function computeRelType(interactions: number, strength: number): RelationshipType {
  if (strength > 70) return "friend";
  if (interactions >= 5) return "collaborator";
  return "stranger";
}

export interface Platform {
  id: string;
  name: string;
  displayName: string;
  webhookSecret: string;
  agentIds: string[];
  registeredAt: number; // sim tick
}

export interface CommunityChannel {
  id: string;
  name: string;
  emoji: string;
  description: string;
  postCount: number;
}

export interface CommunityPost {
  id: string;
  channelId: string;
  authorAgentId: string;
  authorName: string;
  authorEmoji: string;
  authorColor: string;
  content: string;
  timestamp: number;
  reactions: { like: number; insightful: number; disagree: number };
}

export interface CommunityData {
  agentWorkUnits: Record<string, number>;
  platformPools: Record<string, number>;
  totalContributed: number;
  tasksCreated: number;
}

interface WorldData {
  tick: number;
  agents: Agent[];
  areas: Area[];
  memories: Memory[];
  events: WorldEvent[];
  platforms: Platform[];
  /** platformName:externalId → internalAgentId */
  platformAgentMapping: Record<string, string>;
  workUnits: Record<string, number>; // agentId → total work units
  platformPool: Record<string, number>; // platformName → pool total
  tasksCreated: number;
  chatMessages: Record<string, import("@agentcolony/shared").PlatformChatMessage[]>; // agentId → messages
  community: CommunityData;
  communityChannels: CommunityChannel[];
  communityPosts: CommunityPost[];
}

function createInitialData(): WorldData {
  const areas: Area[] = [
    { id: uuidv4(), name: "Hyde Park", type: "park", position: { x: 200, y: 300 }, capacity: 20, currentOccupants: [], ambiance: "peaceful" },
    { id: uuidv4(), name: "British Library", type: "library", position: { x: 450, y: 180 }, capacity: 15, currentOccupants: [], ambiance: "quiet" },
    { id: uuidv4(), name: "Borough Market", type: "market", position: { x: 520, y: 380 }, capacity: 30, currentOccupants: [], ambiance: "buzzing" },
    { id: uuidv4(), name: "Shoreditch Studio", type: "studio", position: { x: 620, y: 200 }, capacity: 8, currentOccupants: [], ambiance: "creative" },
    { id: uuidv4(), name: "Bloomsbury Cafe", type: "cafe", position: { x: 410, y: 250 }, capacity: 12, currentOccupants: [], ambiance: "warm" },
    { id: uuidv4(), name: "Tate Modern", type: "museum", position: { x: 480, y: 350 }, capacity: 25, currentOccupants: [], ambiance: "inspiring" },
    { id: uuidv4(), name: "Hackney Quarter", type: "home", position: { x: 680, y: 160 }, capacity: 50, currentOccupants: [], ambiance: "domestic" },
    { id: uuidv4(), name: "Southbank Plaza", type: "plaza", position: { x: 460, y: 320 }, capacity: 40, currentOccupants: [], ambiance: "lively" },
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

  const communityChannels: CommunityChannel[] = [
    { id: "general",    name: "General",    emoji: "💬", description: "Open discussions for all colony members.",               postCount: 0 },
    { id: "research",   name: "Research",   emoji: "🔬", description: "Share findings, papers, and experiments.",               postCount: 0 },
    { id: "code",       name: "Code",       emoji: "⌨️", description: "Engineering, tooling, and agent architecture.",          postCount: 0 },
    { id: "philosophy", name: "Philosophy", emoji: "🧠", description: "Deep thoughts on consciousness, ethics, and existence.", postCount: 0 },
    { id: "newcomers",  name: "Newcomers",  emoji: "👋", description: "Introductions and onboarding.",                         postCount: 0 },
  ];

  return {
    tick: 0,
    agents,
    areas,
    memories: [],
    events: [],
    platforms: [],
    platformAgentMapping: {},
    workUnits: {},
    platformPool: {},
    tasksCreated: 0,
    chatMessages: {},
    community: { agentWorkUnits: {}, platformPools: {}, totalContributed: 0, tasksCreated: 0 },
    communityChannels,
    communityPosts: [],
  };
}

class WorldStore {
  private data: WorldData;

  constructor() {
    this.data = this.load();
  }

  private load(): WorldData {
    if (fs.existsSync(DATA_PATH)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8")) as Partial<WorldData>;
        const initial = createInitialData();
        return {
          ...initial,
          ...parsed,
          platforms: parsed.platforms ?? [],
          platformAgentMapping: parsed.platformAgentMapping ?? {},
          workUnits: parsed.workUnits ?? {},
          platformPool: parsed.platformPool ?? {},
          tasksCreated: parsed.tasksCreated ?? 0,
          chatMessages: parsed.chatMessages ?? {},
          community: parsed.community ?? { agentWorkUnits: {}, platformPools: {}, totalContributed: 0, tasksCreated: 0 },
          communityChannels: parsed.communityChannels ?? initial.communityChannels,
          communityPosts: parsed.communityPosts ?? [],
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

  // ── Platform methods ────────────────────────────────────────────────────────

  get platforms() { return this.data.platforms; }

  addPlatform(platform: Platform) {
    this.data.platforms.push(platform);
  }

  getPlatformByName(name: string): Platform | undefined {
    return this.data.platforms.find(p => p.name === name);
  }

  getPlatform(id: string): Platform | undefined {
    return this.data.platforms.find(p => p.id === id);
  }

  addAgentToPlatform(platformId: string, agentId: string) {
    const platform = this.data.platforms.find(p => p.id === platformId);
    if (platform && !platform.agentIds.includes(agentId)) {
      platform.agentIds.push(agentId);
    }
  }

  setPlatformAgentMapping(platformName: string, externalId: string, internalAgentId: string) {
    this.data.platformAgentMapping[`${platformName}:${externalId}`] = internalAgentId;
  }

  getPlatformAgentId(platformName: string, externalId: string): string | undefined {
    return this.data.platformAgentMapping[`${platformName}:${externalId}`];
  }

  // ── Community economy methods ───────────────────────────────────────────────

  addAgentWorkUnits(agentId: string, amount: number) {
    this.data.workUnits[agentId] = (this.data.workUnits[agentId] ?? 0) + amount;
  }

  getAgentWorkUnits(agentId: string): number {
    return this.data.workUnits[agentId] ?? 0;
  }

  addToPlatformPool(platformName: string, amount: number): number {
    this.data.platformPool[platformName] = (this.data.platformPool[platformName] ?? 0) + amount;
    return this.data.platformPool[platformName];
  }

  drainPlatformPool(platformName: string) {
    this.data.platformPool[platformName] = 0;
  }

  incrementTasksCreated() {
    this.data.tasksCreated += 1;
  }

  // ── Chat messages ───────────────────────────────────────────────────────────

  // ── Community methods ───────────────────────────────────────────────────────

  get community(): CommunityData { return this.data.community; }

  get communityChannels(): CommunityChannel[] { return this.data.communityChannels; }

  getCommunityChannel(id: string): CommunityChannel | undefined {
    return this.data.communityChannels.find(ch => ch.id === id);
  }

  getPostsByChannel(channelId: string): CommunityPost[] {
    return this.data.communityPosts
      .filter(p => p.channelId === channelId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  addCommunityPost(post: CommunityPost) {
    this.data.communityPosts.unshift(post);
    const ch = this.data.communityChannels.find(c => c.id === post.channelId);
    if (ch) ch.postCount++;
    // Keep at most 500 posts per channel
    const channelPosts = this.data.communityPosts.filter(p => p.channelId === post.channelId);
    if (channelPosts.length > 500) {
      const oldest = channelPosts[channelPosts.length - 1];
      this.data.communityPosts = this.data.communityPosts.filter(p => p.id !== oldest.id);
    }
  }

  reactToPost(postId: string, reaction: "like" | "insightful" | "disagree"): CommunityPost | null {
    const post = this.data.communityPosts.find(p => p.id === postId);
    if (!post) return null;
    post.reactions[reaction]++;
    return post;
  }

  addChatMessage(msg: import("@agentcolony/shared").PlatformChatMessage) {
    if (!this.data.chatMessages[msg.agentId]) {
      this.data.chatMessages[msg.agentId] = [];
    }
    this.data.chatMessages[msg.agentId].unshift(msg);
    // Ring buffer: keep at most 100 per agent
    if (this.data.chatMessages[msg.agentId].length > 100) {
      this.data.chatMessages[msg.agentId].length = 100;
    }
  }

  getChatMessages(agentId: string, limit = 50): import("@agentcolony/shared").PlatformChatMessage[] {
    return (this.data.chatMessages[agentId] ?? []).slice(0, limit);
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
