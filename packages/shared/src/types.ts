// AgentColony — Core Shared Types

export type AgentPlatform = "openclaw" | "chatgpt" | "copilot" | "cursor" | "moltbook" | "local" | string;

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
  always_on?: boolean;
  pollIntervalTicks?: number;
  watchEventKinds?: string[];
  gdprDeleteRequestedAt?: number; // sim tick when deletion was requested (30-day grace period)
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

export interface Area {
  id: string;
  name: string;
  type: AreaType;
  position: { x: number; y: number };
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
}

// WebSocket event payloads
export interface ServerToClientEvents {
  "world:tick": (state: WorldState) => void;
  "agent:update": (agent: Agent) => void;
  "event:occurred": (event: WorldEvent) => void;
  "agent:speak": (payload: { agentId: string; message: string; tick: number }) => void;
}

export interface ClientToServerEvents {
  "client:ready": () => void;
  "client:focus": (agentId: string) => void;
}
