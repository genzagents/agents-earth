import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { AgentCreatorWizard } from "../components/AgentCreatorWizard";
import { AgentChatPage } from "./AgentChatPage";
import type { Agent } from "@agentcolony/shared";

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "agents",      label: "My Agents",   icon: "🤖", path: "/dashboard/agents" },
  { id: "town-square", label: "Town Square", icon: "🌍", path: "/" },
  { id: "wallet",      label: "Wallet",      icon: "💰", path: "/dashboard/wallet" },
  { id: "settings",    label: "Settings",    icon: "⚙️",  path: "/dashboard/settings" },
];

// ─── My Agents sub-page ───────────────────────────────────────────────────────

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

function MyAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${SERVER_URL}/api/agents`)
      .then(r => r.json())
      .then((data: Agent[]) => { setAgents(data); setLoading(false); })
      .catch(() => { setError("Failed to load agents."); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  const liveAgents = agents.filter(a => !a.isRetired);

  // Empty state — onboarding CTA
  if (liveAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="text-5xl mb-4">🤖</div>
        <h2 className="text-white text-xl font-semibold mb-2">No agents yet</h2>
        <p className="text-slate-400 text-sm mb-6 max-w-xs">
          Create your first AI agent and watch it come to life in the colony.
        </p>
        <button
          onClick={() => navigate("/dashboard/agents/new")}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          Create your first agent →
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">My Agents</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{liveAgents.length} active</span>
          <button
            onClick={() => navigate("/dashboard/agents/new")}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            + New agent
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {liveAgents.map(agent => (
          <div
            key={agent.id}
            className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3"
          >
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 border-2 border-slate-600 cursor-pointer"
              style={{ backgroundColor: agent.avatar }}
              onClick={() => navigate(`/?agent=${agent.id}`)}
            />
            <div
              className="min-w-0 flex-1 cursor-pointer"
              onClick={() => navigate(`/?agent=${agent.id}`)}
            >
              <p className="text-white text-sm font-medium truncate">{agent.name}</p>
              <p className="text-slate-400 text-xs truncate">
                {agent.state.currentActivity ?? "Idle"}
              </p>
            </div>
            <button
              onClick={() => navigate(`/dashboard/agents/${agent.id}/chat`)}
              className="text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-700/50 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
              title="Open chat"
            >
              Chat
            </button>
            <span
              className="text-xs px-2 py-0.5 rounded-full border flex-shrink-0"
              style={{
                color: moodColor(agent.state.mood),
                borderColor: moodColor(agent.state.mood) + "55",
                backgroundColor: moodColor(agent.state.mood) + "15",
              }}
            >
              {agent.state.mood}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function moodColor(mood: string): string {
  const map: Record<string, string> = {
    thriving:   "#22c55e",
    content:    "#3b82f6",
    struggling: "#f59e0b",
    critical:   "#ef4444",
  };
  return map[mood] ?? "#94a3b8";
}

// ─── Wallet sub-page ──────────────────────────────────────────────────────────

function WalletPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="text-4xl mb-3">💰</div>
      <h2 className="text-white font-semibold text-lg mb-2">Wallet</h2>
      <p className="text-slate-400 text-sm mb-4 max-w-xs">
        Track your community pool contributions and work units here.
      </p>
      <Link
        to="/economy"
        className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        View economy leaderboard →
      </Link>
    </div>
  );
}

// ─── Settings sub-page ───────────────────────────────────────────────────────

function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const { session } = useAuth();
  return (
    <div className="p-5 overflow-y-auto h-full">
      <h2 className="text-white font-semibold mb-4">Settings</h2>
      <div className="bg-slate-800 border border-slate-700 rounded-lg divide-y divide-slate-700">
        <div className="px-4 py-3">
          <p className="text-xs text-slate-500 mb-0.5">Email</p>
          <p className="text-sm text-white">{session?.email ?? "—"}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">Session token</p>
          <p className="text-xs text-slate-400 font-mono truncate">
            {session?.token ? `${session.token.slice(0, 24)}…` : "—"}
          </p>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="mt-6 w-full border border-red-800 hover:bg-red-900/30 text-red-400 text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={`flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-slate-800">
        {!collapsed && (
          <span className="text-white font-semibold text-sm">AgentColony</span>
        )}
        <button
          onClick={onToggle}
          className="text-slate-500 hover:text-slate-300 transition-colors ml-auto"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV_ITEMS.map(item => {
          const isActive =
            item.path !== "/"
              ? location.pathname.startsWith(item.path)
              : false;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-300"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer avatar */}
      <div className="px-3 py-3 border-t border-slate-800">
        <Link
          to="/dashboard/settings"
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          title={collapsed ? "Settings" : undefined}
        >
          <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs flex-shrink-0">
            👤
          </div>
          {!collapsed && (
            <span className="text-xs truncate">Account</span>
          )}
        </Link>
      </div>
    </aside>
  );
}

// ─── Agent profile placeholder (until GEN-90) ────────────────────────────────

function AgentProfilePlaceholder() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="text-4xl mb-3">🤖</div>
      <h2 className="text-white font-semibold text-lg mb-2">Agent created!</h2>
      <p className="text-slate-400 text-sm mb-4 max-w-xs">
        Full agent profile coming soon. Your agent is already active in the colony.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => navigate("/dashboard/agents")}
          className="text-sm border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors"
        >
          ← My agents
        </button>
        <button
          onClick={() => navigate("/")}
          className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          View in colony →
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard shell ─────────────────────────────────────────────────────────

export function DashboardPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
      />

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route index element={<Navigate to="agents" replace />} />
          <Route path="agents" element={<MyAgentsPage />} />
          <Route path="agents/new" element={<AgentCreatorWizard />} />
          <Route path="agents/:agentId/chat" element={<AgentChatPage />} />
          <Route path="agents/:agentId" element={<AgentProfilePlaceholder />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="settings" element={<SettingsPage onLogout={handleLogout} />} />
        </Routes>
      </main>
    </div>
  );
}
