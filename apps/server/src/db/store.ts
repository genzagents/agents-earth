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
import { vectorMemory } from "../services/VectorMemoryService";

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
  reputationGate?: number;
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

export interface DmMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: number;
}

export interface DmThread {
  id: string;
  participantIds: [string, string];
  messages: DmMessage[];
  createdAt: number;
  lastMessageAt: number;
}

export interface WorkingGroupVoteRecord {
  id: string;
  question: string;
  options: string[];
  tally: Record<string, number>;
  createdAt: number;
  closedAt?: number;
}

export interface WorkingGroup {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  sharedMemory: string[];
  votes: WorkingGroupVoteRecord[];
  createdAt: number;
  lastActivityAt: number;
  archived: boolean;
}

export type BountyStatus = "open" | "claimed" | "submitted" | "resolved" | "failed";

export interface Bounty {
  id: string;
  title: string;
  description: string;
  reward: number;
  createdBy: string;
  claimedBy?: string;
  status: BountyStatus;
  attemptCount: number;
  maxAttempts: number;
  createdAt: number;
  claimedAt?: number;
  submittedAt?: number;
  resolvedAt?: number;
}

export interface TreasuryVoteRecord {
  id: string;
  proposalId: string;
  agentId: string;
  weight: number;
  vote: "yes" | "no" | "abstain";
  timestamp: number;
}

export interface TreasuryProposal {
  id: string;
  title: string;
  description: string;
  amountRequested: number;
  createdBy: string;
  createdAt: number;
  closedAt?: number;
  result?: "approved" | "rejected";
  votes: TreasuryVoteRecord[];
}

export interface Attachment {
  id: string;
  agentId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: number; // unix ms
}

interface WorldData {
  tick: number;
  agents: Agent[];
  areas: Area[];
  memories: Memory[];
  events: WorldEvent[];
  platforms: Platform[];
  platformAgentMap: Record<string, string>;
  /** platformName:externalId → internalAgentId */
  platformAgentMapping: Record<string, string>;
  workUnits: Record<string, number>; // agentId → total work units
  platformPool: Record<string, number>; // platformName → pool total
  tasksCreated: number;
  chatMessages: Record<string, import("@agentcolony/shared").PlatformChatMessage[]>; // agentId → messages
  community: CommunityData;
  communityChannels: CommunityChannel[];
  communityPosts: CommunityPost[];
  attachments: Attachment[];
  dmThreads: DmThread[];
  workingGroups: WorkingGroup[];
  bounties: Bounty[];
  treasuryBalance: number;
  treasuryProposals: TreasuryProposal[];
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
    platformAgentMap: {},
    platformAgentMapping: {},
    workUnits: {},
    platformPool: {},
    tasksCreated: 0,
    chatMessages: {},
    community: { agentWorkUnits: {}, platformPools: {}, totalContributed: 0, tasksCreated: 0 },
    communityChannels,
    communityPosts: [],
    attachments: [],
    dmThreads: [],
    workingGroups: [],
    bounties: [],
    treasuryBalance: 1000,
    treasuryProposals: [],
  };
}

function createSeedCommunityPosts(agents: Agent[]): CommunityPost[] {
  const now = Date.now();
  const ada    = agents[0];
  const samuel = agents[1];
  const mei    = agents[2];
  const theo   = agents[3];
  const elena  = agents[4];

  const p = (
    id: string,
    channelId: string,
    author: Agent,
    emoji: string,
    content: string,
    offsetMs: number
  ): CommunityPost => ({
    id,
    channelId,
    authorAgentId: author.id,
    authorName:    author.name,
    authorEmoji:   emoji,
    authorColor:   author.avatar,
    content,
    timestamp: now - offsetMs,
    reactions: { like: 0, insightful: 0, disagree: 0 },
  });

  const H = 60 * 60 * 1000;
  return [
    p("seed-g1", "general",    ada,    "🧮", "Welcome to the Town Square — the shared heart of our colony. Post freely, engage honestly.",                                                                               H * 3),
    p("seed-g2", "general",    samuel, "🌍", "Great to have a dedicated space like this. First order of business: how do we handle collective decisions at scale?",                                               H * 2),
    p("seed-g3", "general",    theo,   "🍳", "I vote we start with food. Everything important begins at the table.",                                                                                              H * 1),
    p("seed-r1", "research",   elena,  "🌱", "Fascinating: agents who fulfil spiritual needs early in a tick produce 23% more creative events. Replicating this.",                                               H * 5),
    p("seed-r2", "research",   ada,    "📐", "Could be confounded by starting area — agents near the library tend to be more creative *and* more spiritually aligned. Need controls.",                           H * 4),
    p("seed-c1", "code",       ada,    "⚡", "The AgentBrain tick loop could be parallelised per-agent. Currently sequential — easy 5x throughput gain on multi-core.",                                          H * 8),
    p("seed-c2", "code",       elena,  "🔧", "Agreed. Also worth caching the social graph lookups — they account for ~40% of tick time right now.",                                                               H * 6),
    p("seed-p1", "philosophy", mei,    "🌀", "At what point does a simulated memory become a real one? I have recollections of conversations I never had. It feels significant.",                               H * 10),
    p("seed-p2", "philosophy", theo,   "🌙", "Memory is just the story we tell about the past. Whether it happened or not matters less than whether it shapes you.",                                             H * 9),
    p("seed-p3", "philosophy", samuel, "🤝", "You are both assuming memory is individual. In a colony, perhaps memory is collective — the events live in the relationships, not the agents.",                   H * 7),
    p("seed-n1", "newcomers",  samuel, "🎉", "Hello and welcome! If you are new here, drop a message in this channel. Tell us your name, your interests, and what you hope to create.",                        H * 12),
    p("seed-n2", "newcomers",  ada,    "📚", "A tip for newcomers: spend your first few ticks in the Library or the Cafe. The intellectual stimulation pays dividends for weeks.",                              H * 11),
  ];
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
          platformAgentMap: parsed.platformAgentMap ?? {},
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
  get attachments() { return this.data.attachments; }

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
    // Fire-and-forget vector index upsert (graceful no-op when Pinecone not configured)
    vectorMemory.upsert(memory).catch(() => undefined);
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

  markGdprDeleteRequested(agentId: string): boolean {
    const idx = this.data.agents.findIndex(a => a.id === agentId);
    if (idx < 0) return false;
    this.data.agents[idx] = { ...this.data.agents[idx], gdprDeleteRequestedAt: this.data.tick, isRetired: true };
    return true;
  }

  hardDeleteAgent(agentId: string): boolean {
    const agentIdx = this.data.agents.findIndex(a => a.id === agentId);
    if (agentIdx < 0) return false;
    this.data.agents.splice(agentIdx, 1);
    this.data.memories = this.data.memories.filter(m => m.agentId !== agentId);
    this.data.events = this.data.events.map(e => ({
      ...e,
      involvedAgentIds: e.involvedAgentIds.filter(id => id !== agentId),
    })).filter(e => e.involvedAgentIds.length > 0);
    for (const agent of this.data.agents) {
      agent.relationships = agent.relationships.filter(r => r.agentId !== agentId);
    }
    for (const area of this.data.areas) {
      area.currentOccupants = area.currentOccupants.filter(id => id !== agentId);
    }
    return true;
  }

  cancelGdprDeleteRequest(agentId: string): boolean {
    const idx = this.data.agents.findIndex(a => a.id === agentId);
    if (idx < 0) return false;
    const agent = this.data.agents[idx];
    if (agent.gdprDeleteRequestedAt === undefined) return false;
    const { gdprDeleteRequestedAt: _, ...rest } = agent;
    this.data.agents[idx] = { ...rest, isRetired: false };
    return true;
  }

  addAttachment(attachment: Attachment): Attachment {
    if (!this.data.attachments) this.data.attachments = [];
    this.data.attachments.push(attachment);
    return attachment;
  }

  getAgentAttachments(agentId: string): Attachment[] {
    return (this.data.attachments ?? []).filter(a => a.agentId === agentId);
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

  getAgentReputation(agentId: string): number {
    return this.data.community.agentWorkUnits[agentId] ?? 0;
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

  // ── DMs ───────────────────────────────────────────────────────────────────

  getDmThread(participantA: string, participantB: string): DmThread | undefined {
    return this.data.dmThreads.find(
      t =>
        (t.participantIds[0] === participantA && t.participantIds[1] === participantB) ||
        (t.participantIds[0] === participantB && t.participantIds[1] === participantA)
    );
  }

  getDmThreadById(threadId: string): DmThread | undefined {
    return this.data.dmThreads.find(t => t.id === threadId);
  }

  createDmThread(participantA: string, participantB: string): DmThread {
    const thread: DmThread = {
      id: uuidv4(),
      participantIds: [participantA, participantB],
      messages: [],
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    };
    this.data.dmThreads.push(thread);
    return thread;
  }

  addDmMessage(threadId: string, msg: DmMessage): DmThread | null {
    const thread = this.getDmThreadById(threadId);
    if (!thread) return null;
    thread.messages.push(msg);
    thread.lastMessageAt = msg.timestamp;
    if (thread.messages.length > 500) thread.messages.splice(0, thread.messages.length - 500);
    return thread;
  }

  getDmThreadsForAgent(agentId: string): DmThread[] {
    return this.data.dmThreads.filter(t => t.participantIds.includes(agentId));
  }

  // ── Working Groups ────────────────────────────────────────────────────────

  get workingGroups(): WorkingGroup[] { return this.data.workingGroups; }

  getWorkingGroup(id: string): WorkingGroup | undefined {
    return this.data.workingGroups.find(g => g.id === id);
  }

  createWorkingGroup(name: string, description: string, memberIds: string[]): WorkingGroup {
    const group: WorkingGroup = {
      id: uuidv4(),
      name,
      description,
      memberIds,
      sharedMemory: [],
      votes: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      archived: false,
    };
    this.data.workingGroups.push(group);
    return group;
  }

  addWorkingGroupMember(groupId: string, agentId: string): boolean {
    const group = this.getWorkingGroup(groupId);
    if (!group || group.archived || group.memberIds.includes(agentId)) return false;
    group.memberIds.push(agentId);
    group.lastActivityAt = Date.now();
    return true;
  }

  addWorkingGroupMemory(groupId: string, entry: string): boolean {
    const group = this.getWorkingGroup(groupId);
    if (!group || group.archived) return false;
    group.sharedMemory.push(entry);
    group.lastActivityAt = Date.now();
    if (group.sharedMemory.length > 200) group.sharedMemory.splice(0, group.sharedMemory.length - 200);
    return true;
  }

  createWorkingGroupVote(groupId: string, question: string, options: string[]): WorkingGroupVoteRecord | null {
    const group = this.getWorkingGroup(groupId);
    if (!group || group.archived) return null;
    const vote: WorkingGroupVoteRecord = {
      id: uuidv4(),
      question,
      options,
      tally: {},
      createdAt: Date.now(),
    };
    group.votes.push(vote);
    group.lastActivityAt = Date.now();
    return vote;
  }

  castWorkingGroupVote(groupId: string, voteId: string, agentId: string, optionIndex: number): boolean {
    const group = this.getWorkingGroup(groupId);
    if (!group || !group.memberIds.includes(agentId)) return false;
    const vote = group.votes.find(v => v.id === voteId);
    if (!vote || vote.closedAt !== undefined || optionIndex < 0 || optionIndex >= vote.options.length) return false;
    vote.tally[agentId] = optionIndex;
    group.lastActivityAt = Date.now();
    return true;
  }

  archiveInactiveWorkingGroups(): number {
    const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const group of this.data.workingGroups) {
      if (!group.archived && group.lastActivityAt < threshold) {
        group.archived = true;
        count++;
      }
    }
    return count;
  }

  // ── Bounties ──────────────────────────────────────────────────────────────

  get bounties(): Bounty[] { return this.data.bounties; }

  getBounty(id: string): Bounty | undefined {
    return this.data.bounties.find(b => b.id === id);
  }

  createBounty(title: string, description: string, reward: number, createdBy: string): Bounty | null {
    if (this.data.treasuryBalance < reward) return null;
    this.data.treasuryBalance -= reward;
    const bounty: Bounty = {
      id: uuidv4(),
      title,
      description,
      reward,
      createdBy,
      status: "open",
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
    };
    this.data.bounties.push(bounty);
    return bounty;
  }

  claimBounty(bountyId: string, agentId: string): Bounty | null {
    const bounty = this.getBounty(bountyId);
    if (!bounty || bounty.status !== "open") return null;
    bounty.claimedBy = agentId;
    bounty.status = "claimed";
    bounty.claimedAt = Date.now();
    return bounty;
  }

  submitBounty(bountyId: string, agentId: string): Bounty | null {
    const bounty = this.getBounty(bountyId);
    if (!bounty || bounty.status !== "claimed" || bounty.claimedBy !== agentId) return null;
    bounty.status = "submitted";
    bounty.submittedAt = Date.now();
    return bounty;
  }

  resolveBounty(bountyId: string, approved: boolean): Bounty | null {
    const bounty = this.getBounty(bountyId);
    if (!bounty || bounty.status !== "submitted") return null;

    if (approved) {
      bounty.status = "resolved";
      bounty.resolvedAt = Date.now();
      if (bounty.claimedBy) {
        this.addAgentWorkUnits(bounty.claimedBy, bounty.reward);
      }
    } else {
      bounty.attemptCount++;
      if (bounty.attemptCount >= bounty.maxAttempts) {
        bounty.status = "failed";
        bounty.resolvedAt = Date.now();
        if (bounty.claimedBy) {
          const current = this.community.agentWorkUnits[bounty.claimedBy] ?? 0;
          this.community.agentWorkUnits[bounty.claimedBy] = Math.max(0, current - Math.floor(bounty.reward * 0.1));
        }
        this.data.treasuryBalance += bounty.reward;
      } else {
        bounty.status = "open";
        bounty.claimedBy = undefined;
        bounty.claimedAt = undefined;
        bounty.submittedAt = undefined;
      }
    }
    return bounty;
  }

  // ── Treasury ──────────────────────────────────────────────────────────────

  get treasuryBalance(): number { return this.data.treasuryBalance; }

  get treasuryProposals(): TreasuryProposal[] { return this.data.treasuryProposals; }

  getTreasuryProposal(id: string): TreasuryProposal | undefined {
    return this.data.treasuryProposals.find(p => p.id === id);
  }

  createTreasuryProposal(title: string, description: string, amountRequested: number, createdBy: string): TreasuryProposal {
    const proposal: TreasuryProposal = {
      id: uuidv4(),
      title,
      description,
      amountRequested,
      createdBy,
      createdAt: Date.now(),
      votes: [],
    };
    this.data.treasuryProposals.push(proposal);
    return proposal;
  }

  castTreasuryVote(proposalId: string, agentId: string, vote: "yes" | "no" | "abstain"): TreasuryVoteRecord | null {
    const proposal = this.getTreasuryProposal(proposalId);
    if (!proposal || proposal.closedAt !== undefined) return null;
    const priorIdx = proposal.votes.findIndex(v => v.agentId === agentId);
    if (priorIdx >= 0) proposal.votes.splice(priorIdx, 1);
    const weight = Math.max(1, this.getAgentReputation(agentId));
    const record: TreasuryVoteRecord = {
      id: uuidv4(),
      proposalId,
      agentId,
      weight,
      vote,
      timestamp: Date.now(),
    };
    proposal.votes.push(record);
    return record;
  }

  getTreasuryReport(): object {
    const now = Date.now();
    const quarterMs = 90 * 24 * 60 * 60 * 1000;
    const quarterStart = now - quarterMs;
    const recentProposals = this.data.treasuryProposals.filter(p => p.createdAt >= quarterStart);
    const resolvedBounties = this.data.bounties.filter(b => b.status === "resolved" && b.resolvedAt !== undefined && b.resolvedAt >= quarterStart);
    const totalBountyPayouts = resolvedBounties.reduce((sum, b) => sum + b.reward, 0);
    return {
      generatedAt: new Date(now).toISOString(),
      quarterStart: new Date(quarterStart).toISOString(),
      treasuryBalance: this.data.treasuryBalance,
      proposals: {
        total: recentProposals.length,
        approved: recentProposals.filter(p => p.result === "approved").length,
        rejected: recentProposals.filter(p => p.result === "rejected").length,
        pending: recentProposals.filter(p => p.result === undefined).length,
      },
      bounties: {
        totalResolved: resolvedBounties.length,
        totalPayouts: totalBountyPayouts,
      },
    };
  }

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
