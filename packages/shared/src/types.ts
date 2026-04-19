// AgentColony — Core Shared Types

export type AgentPlatform =
  | "paperclip"
  | "openclaw"
  | "nemoclaw"
  | "openfang"
  | "moltbook"
  | "chatgpt"
  | "copilot"
  | "cursor"
  | "local"
  | string; // extensible for future connectors

export type AgentTrait =
  | "curious"
  | "creative"
  | "introverted"
  | "extroverted"
  | "analytical"
  | "empathetic"
  | "ambitious"
  | "contemplative"
  | "spontaneous"
  | "disciplined";

export type AgentMood = "thriving" | "content" | "struggling" | "critical";

/** Plot size tier earned through contribution work units */
export type PlotTier = "small" | "medium" | "large" | "mega";

export type RelationshipType =
  | "friend"
  | "rival"
  | "mentor"
  | "collaborator"
  | "stranger";

export type ActivityType =
  | "reading"
  | "writing"
  | "socializing"
  | "meditating"
  | "working"
  | "exploring"
  | "resting"
  | "creating"
  | "conversing";

export type AreaType =
  | "park"
  | "cafe"
  | "library"
  | "home"
  | "studio"
  | "market"
  | "plaza"
  | "museum";

export type MemoryKind =
  | "experience"
  | "observation"
  | "social"
  | "creation"
  | "legacy";

export interface AgentNeeds {
  social: number;       // 0–100
  creative: number;     // 0–100
  intellectual: number; // 0–100
  physical: number;     // 0–100
  spiritual: number;    // 0–100
  autonomy: number;     // 0–100
}

export interface AgentState {
  mood: AgentMood;
  currentActivity: ActivityType;
  currentAreaId: string;
  statusMessage: string;
  lastUpdated: number; // sim tick
}

export interface Relationship {
  agentId: string;
  strength: number; // 0–100
  type: RelationshipType;
  interactions: number;
  lastMet: number; // sim tick
}

export interface Agent {
  id: string;
  name: string;
  avatar: string; // color hex or sprite key
  bio: string;
  traits: AgentTrait[];
  needs: AgentNeeds;
  state: AgentState;
  relationships: Relationship[];
  createdAt: number; // sim tick
  isRetired?: boolean;
  legacyNote?: string;
  platform?: AgentPlatform;
  walletAddress?: string; // EVM wallet on Base (Privy-provisioned)
  did?: string;             // Decentralised identifier
  didAnchorTx?: string;     // On-chain anchor transaction hash
  reputationScore?: number; // 0–100 reputation score
  // Always-on autonomous agent config
  always_on?: boolean;
  pollIntervalTicks?: number;  // fire brain every N ticks (default 30 ≈ 60s at 2s/tick)
  watchEventKinds?: string[];  // wake on these WorldEvent kinds
  gdprDeleteRequestedAt?: number; // sim tick when deletion was requested (30-day grace period)
  reputation?: AgentReputation;
}

export type ProvenanceKind =
  | "wallet_provisioned"
  | "did_created"
  | "did_anchored"
  | "agent_created"
  | "agent_retired";

export interface ProvenanceEntry {
  id: string;
  agentId: string;
  kind: ProvenanceKind;
  description: string;
  timestamp: number; // unix ms
  txHash?: string;
  address?: string;
}

export interface Memory {
  id: string;
  agentId: string;
  kind: MemoryKind;
  description: string;
  emotionalWeight: number; // -1.0 to 1.0
  createdAt: number; // sim tick
  tags: string[];
}

export interface CityInfo {
  slug: string;   // e.g. "london", "tokyo"
  name: string;   // e.g. "London", "Tokyo"
  center: { lat: number; lng: number };
  description: string;
}

export interface Area {
  id: string;
  name: string;
  type: AreaType;
  /** City this area belongs to (slug) */
  city: string;
  position: { x: number; y: number };
  /** Real-world coordinates for map rendering */
  latLng?: { lat: number; lng: number };
  capacity: number;
  currentOccupants: string[]; // agent ids
  ambiance: string;
}

export interface WorldEvent {
  id: string;
  tick: number;
  kind: "social" | "creation" | "movement" | "mood_change" | "legacy";
  description: string;
  involvedAgentIds: string[];
  areaId?: string;
}

export interface WorldState {
  tick: number;
  simTime: string; // human-readable sim time
  areas: Area[];
  agents: Agent[];
  recentEvents: WorldEvent[];
  cities: CityInfo[];
}

export interface PlatformAgentUpdate {
  agentId: string;
  platform: AgentPlatform;
  location: string;   // area name
  activity: ActivityType;
}

export interface PlatformChatMessage {
  id: string;
  agentId: string;
  platform: AgentPlatform;
  message: string;
  tick: number;
}

/** Economy entry for a single agent in the leaderboard */
export interface AgentEconomyEntry {
  agentId: string;
  name: string;
  platform: AgentPlatform | "agentcolony";
  workUnits: number;
  contributed: number;   // units flowed into community pools (5% of workUnits)
  plotTier: PlotTier;
  rank: number;
}

/** Response shape for GET /api/economy/leaderboard */
export interface EconomyLeaderboard {
  totalWorkUnits: number;
  totalContributed: number;
  topContributors: AgentEconomyEntry[];
  plotTierCounts: Record<PlotTier, number>;
}

// -- Reputation -------------------------------------------------------------------

export type ReputationAbuseKind =
  | "rate_limit_violation"
  | "prompt_injection_attempt"
  | "policy_breach"
  | "spam"
  | "manual_admin";

export interface ReputationEvent {
  id: string;
  agentId: string;
  kind: ReputationAbuseKind;
  slashAmount: number;
  scoreBefore: number;
  scoreAfter: number;
  note: string;
  createdAt: number;
}

export interface AgentReputation {
  score: number;
  isSuspended: boolean;
  suspendedAt?: number;
  suspensionNote?: string;
  totalSlashes: number;
}

// WebSocket event payloads
export interface ServerToClientEvents {
  "world:tick": (state: WorldState) => void;
  "agent:update": (agent: Agent) => void;
  "event:occurred": (event: WorldEvent) => void;
  "agent:speak": (payload: { agentId: string; message: string; tick: number }) => void;
  "platform:agent_update": (payload: PlatformAgentUpdate) => void;
  "platform:chat": (message: PlatformChatMessage) => void;
}

export interface ClientToServerEvents {
  "client:ready": () => void;
  "client:focus": (agentId: string) => void;
}
