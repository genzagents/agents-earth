import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useBridgeStore } from "./store/bridgeStore";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { AgentCard } from "./components/AgentCard";
import { ApprovalQueue } from "./components/ApprovalQueue";
import { AuditLog } from "./components/AuditLog";
import type { BridgeStatus, PendingApproval, AuditEntry, AgentPermissions } from "./types";

const TABS = [
  { key: "agents", label: "Agents" },
  { key: "approvals", label: "Approvals" },
  { key: "log", label: "Audit Log" },
] as const;

export default function App() {
  const {
    activeTab,
    setActiveTab,
    applyStatus,
    setPermissions,
    setApprovals,
    prependAuditEntries,
    permissions,
    approvals,
  } = useBridgeStore();

  // ---- Bootstrap: load initial state from Rust side ----
  useEffect(() => {
    invoke<BridgeStatus>("get_bridge_status")
      .then(applyStatus)
      .catch((err) => console.warn("get_bridge_status error", err));

    invoke<{ agentId: string; permissions: AgentPermissions }[]>("list_agent_permissions")
      .then((list) => {
        list.forEach(({ agentId, permissions: p }) => setPermissions(agentId, p));
      })
      .catch((err) => console.warn("list_agent_permissions error", err));

    invoke<PendingApproval[]>("list_pending_approvals")
      .then(setApprovals)
      .catch((err) => console.warn("list_pending_approvals error", err));
  }, [applyStatus, setPermissions, setApprovals]);

  // ---- Real-time events emitted by the Rust WebSocket handler ----
  useEffect(() => {
    const unlisten: Array<() => void> = [];

    listen<BridgeStatus>("bridge:status", (e) => {
      applyStatus(e.payload);
    }).then((u) => unlisten.push(u));

    listen<{ agentId: string; permissions: AgentPermissions }>("bridge:permissions_updated", (e) => {
      setPermissions(e.payload.agentId, e.payload.permissions);
    }).then((u) => unlisten.push(u));

    listen<PendingApproval>("bridge:approval_created", (e) => {
      setApprovals([e.payload, ...useBridgeStore.getState().approvals]);
    }).then((u) => unlisten.push(u));

    listen<AuditEntry[]>("bridge:audit_entries", (e) => {
      prependAuditEntries(e.payload);
    }).then((u) => unlisten.push(u));

    return () => unlisten.forEach((fn) => fn());
  }, [applyStatus, setPermissions, setApprovals, prependAuditEntries]);

  const agentIds = Object.keys(permissions);
  const pendingCount = approvals.length;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-genz-bg text-slate-100">
      {/* Custom title bar / drag region */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 py-2 bg-genz-surface border-b border-genz-border shrink-0"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">GenZ Bridge</span>
        </div>
        <ConnectionStatus />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-genz-border shrink-0 bg-genz-surface">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-genz-accent border-b-2 border-genz-accent"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
            {tab.key === "approvals" && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-genz-yellow text-slate-900 text-[10px] font-bold">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "agents" && (
          <div className="space-y-2">
            {agentIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-2">
                <span className="text-2xl">🤖</span>
                No agents connected
              </div>
            ) : (
              agentIds.map((id) => <AgentCard key={id} agentId={id} />)
            )}
          </div>
        )}
        {activeTab === "approvals" && <ApprovalQueue />}
        {activeTab === "log" && <AuditLog />}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-1.5 border-t border-genz-border bg-genz-surface flex justify-between text-xs text-slate-600">
        <span>v0.1.0</span>
        <span>{agentIds.length} agent{agentIds.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
