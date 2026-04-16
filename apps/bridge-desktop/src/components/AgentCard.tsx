import { invoke } from "@tauri-apps/api/core";
import { useBridgeStore } from "../store/bridgeStore";
import type { AgentPermissions, CapabilityType } from "../types";

const CAPABILITY_LABELS: Record<CapabilityType, string> = {
  filesystem: "Files",
  shell: "Shell",
  browser: "Browser",
  notifications: "Notify",
};

const CAPABILITY_ICONS: Record<CapabilityType, string> = {
  filesystem: "📁",
  shell: "💻",
  browser: "🌐",
  notifications: "🔔",
};

const ALL_CAPS: CapabilityType[] = ["filesystem", "shell", "browser", "notifications"];

interface AgentCardProps {
  agentId: string;
}

export function AgentCard({ agentId }: AgentCardProps) {
  const perms = useBridgeStore((s) => s.permissions[agentId]);
  const setPermissions = useBridgeStore((s) => s.setPermissions);

  if (!perms) return null;

  async function toggleEnabled() {
    const updated: AgentPermissions = { ...perms, bridgeEnabled: !perms.bridgeEnabled };
    try {
      await invoke("set_agent_permissions", { agentId, permissions: updated });
      setPermissions(agentId, updated);
    } catch (err) {
      console.warn("Failed to toggle agent bridge", err);
    }
  }

  async function toggleCapability(cap: CapabilityType) {
    const caps = perms.capabilities.includes(cap)
      ? perms.capabilities.filter((c) => c !== cap)
      : [...perms.capabilities, cap];
    const updated: AgentPermissions = { ...perms, capabilities: caps };
    try {
      await invoke("set_agent_permissions", { agentId, permissions: updated });
      setPermissions(agentId, updated);
    } catch (err) {
      console.warn("Failed to toggle capability", err);
    }
  }

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        perms.bridgeEnabled
          ? "border-genz-border bg-genz-surface"
          : "border-slate-700 bg-slate-900 opacity-60"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-genz-accent flex items-center justify-center text-xs font-bold">
            {agentId.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-100 leading-none">{agentId}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {perms.bridgeEnabled ? "Active" : "Paused"}
            </p>
          </div>
        </div>

        {/* Enable / Pause toggle */}
        <button
          onClick={toggleEnabled}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            perms.bridgeEnabled ? "bg-genz-green" : "bg-slate-600"
          }`}
          aria-label={perms.bridgeEnabled ? "Pause agent" : "Resume agent"}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              perms.bridgeEnabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Capability pills */}
      <div className="flex flex-wrap gap-1 mt-2">
        {ALL_CAPS.map((cap) => {
          const active = perms.capabilities.includes(cap);
          return (
            <button
              key={cap}
              onClick={() => toggleCapability(cap)}
              title={active ? `Disable ${CAPABILITY_LABELS[cap]}` : `Enable ${CAPABILITY_LABELS[cap]}`}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                active
                  ? "border-genz-accent bg-genz-accent/20 text-genz-accent"
                  : "border-slate-600 text-slate-500 hover:border-slate-400"
              }`}
            >
              <span>{CAPABILITY_ICONS[cap]}</span>
              {CAPABILITY_LABELS[cap]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
