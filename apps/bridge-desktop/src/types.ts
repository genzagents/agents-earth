/** Connection state to the GenZ cloud WSS */
export type ConnectionState = "connected" | "reconnecting" | "disconnected";

export type CapabilityType = "filesystem" | "shell" | "browser" | "notifications";

export interface AgentPermissions {
  agentId: string;
  bridgeEnabled: boolean;
  capabilities: CapabilityType[];
  allowedDirectories: string[];
  allowedCommands: string[];
  blockedCommands: string[];
}

export interface PendingApproval {
  id: string;
  agentId: string;
  agentName: string;
  capability: CapabilityType;
  command: string;
  args?: Record<string, unknown>;
  reason: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  agentId: string;
  agentName: string;
  capability: CapabilityType;
  command: string;
  outcome: "allowed" | "blocked" | "pending_approval";
  error?: string;
  createdAt: string;
}

/** Payload the Rust backend sends via Tauri event `bridge:status` */
export interface BridgeStatus {
  connected: boolean;
  userId: string | null;
  serverUrl: string;
  agentIds: string[];
}

/** Tauri command payloads */
export interface AgentSummary {
  agentId: string;
  name: string;
  paused: boolean;
}
