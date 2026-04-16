import { create } from "zustand";
import type {
  ConnectionState,
  AgentPermissions,
  PendingApproval,
  AuditEntry,
  BridgeStatus,
} from "../types";

interface BridgeStore {
  connectionState: ConnectionState;
  serverUrl: string;
  userId: string | null;

  permissions: Record<string, AgentPermissions>; // keyed by agentId
  approvals: PendingApproval[];
  auditLog: AuditEntry[];

  /** Called when the Rust backend emits a bridge:status event */
  applyStatus: (status: BridgeStatus) => void;

  setPermissions: (agentId: string, perms: AgentPermissions) => void;
  setApprovals: (approvals: PendingApproval[]) => void;
  removeApproval: (id: string) => void;
  prependAuditEntries: (entries: AuditEntry[]) => void;

  activeTab: "agents" | "approvals" | "log";
  setActiveTab: (tab: "agents" | "approvals" | "log") => void;

  selectedAgentId: string | null;
  selectAgent: (agentId: string | null) => void;
}

export const useBridgeStore = create<BridgeStore>((set) => ({
  connectionState: "disconnected",
  serverUrl: "",
  userId: null,

  permissions: {},
  approvals: [],
  auditLog: [],

  applyStatus: (status) =>
    set((s) => ({
      connectionState: status.connected ? "connected" : "disconnected",
      serverUrl: status.serverUrl,
      userId: status.userId,
      // Keep existing permissions; Rust will send updates separately
      permissions: s.permissions,
    })),

  setPermissions: (agentId, perms) =>
    set((s) => ({ permissions: { ...s.permissions, [agentId]: perms } })),

  setApprovals: (approvals) => set({ approvals }),

  removeApproval: (id) =>
    set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) })),

  prependAuditEntries: (entries) =>
    set((s) => ({
      auditLog: [...entries, ...s.auditLog].slice(0, 200),
    })),

  activeTab: "agents",
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedAgentId: null,
  selectAgent: (agentId) => set({ selectedAgentId: agentId }),
}));
