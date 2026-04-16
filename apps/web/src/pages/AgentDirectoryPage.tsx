import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getAgentPlatform, PLATFORM_COLORS, PLATFORM_ICONS, PLATFORMS } from "../utils/platform";
import type { AgentPlatform } from "@agentcolony/shared";

interface AgentSummary {
  id: string;
  name: string;
  avatar: string;
  platform: AgentPlatform | null;
  traits: string[];
  bio: string;
  mood: string;
  currentActivity: string;
  statusMessage: string;
  isRetired: boolean;
}

const MOOD_BADGES: Record<string, string> = {
  thriving: "bg-green-900 text-green-300",
  content: "bg-blue-900 text-blue-300",
  struggling: "bg-amber-900 text-amber-300",
  critical: "bg-red-900 text-red-300",
};

const ACTIVITY_ICONS: Record<string, string> = {
  socializing: "💬", reading: "📖", writing: "✍️", meditating: "🧘",
  working: "💼", exploring: "🚶", resting: "😴", creating: "🎨", conversing: "🗣",
};

export function AgentDirectoryPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activePlatform, setActivePlatform] = useState<AgentPlatform | null>(null);

  const fetchAgents = useCallback((q: string, platform: AgentPlatform | null) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (platform) params.set("platform", platform);
    const url = `/api/agents${params.toString() ? `?${params.toString()}` : ""}`;
    fetch(url)
      .then(r => r.ok ? r.json() as Promise<AgentSummary[]> : [])
      .then(setAgents)
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.title = "Agent Directory — AgentColony";
    fetchAgents("", null);
  }, [fetchAgents]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchAgents(query, activePlatform), 250);
    return () => clearTimeout(t);
  }, [query, activePlatform, fetchAgents]);

  const activeAgents = agents.filter(a => !a.isRetired);
  const retiredAgents = agents.filter(a => a.isRetired);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition-colors">
            ← Back to World
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-bold text-white tracking-tight">Agent Directory</span>
        </div>
        <span className="text-xs text-slate-500">{agents.length} agents</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Search + filters */}
        <div className="space-y-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or bio…"
            className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-4 py-2.5 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Platform:</span>
            <button
              onClick={() => setActivePlatform(null)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activePlatform === null
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              All
            </button>
            {PLATFORMS.map(p => {
              const color = PLATFORM_COLORS[p];
              const icon = PLATFORM_ICONS[p];
              const isActive = activePlatform === p;
              return (
                <button
                  key={p}
                  onClick={() => setActivePlatform(isActive ? null : p)}
                  className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={isActive
                    ? { background: color, borderColor: color, color: "#fff" }
                    : { background: "transparent", borderColor: `${color}66`, color: color }
                  }
                >
                  {icon} {p}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-16">
            <span className="text-slate-600 text-sm animate-pulse">Loading…</span>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 text-slate-600 text-sm italic">No agents found.</div>
        ) : (
          <>
            {activeAgents.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">
                  Active Citizens ({activeAgents.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeAgents.map(agent => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              </div>
            )}

            {retiredAgents.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3 mt-6">
                  Retired ({retiredAgents.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                  {retiredAgents.map(agent => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentSummary }) {
  const platform = getAgentPlatform(agent as { id: string; platform?: AgentPlatform });
  const platformColor = PLATFORM_COLORS[platform];
  const platformIcon = PLATFORM_ICONS[platform];

  return (
    <Link
      to={`/agents/${agent.id}`}
      className="block rounded-xl bg-slate-900 border border-slate-700 p-4 hover:border-slate-500 transition-colors group"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white group-hover:scale-105 transition-transform"
          style={{ backgroundColor: agent.avatar, border: `2px solid ${platformColor}` }}
        >
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm truncate group-hover:text-indigo-300 transition-colors">
            {agent.name}
          </div>
          <div className="text-xs mt-0.5" style={{ color: platformColor }}>
            {platformIcon} {platform}
          </div>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${MOOD_BADGES[agent.mood] ?? ""}`}>
          {agent.mood}
        </span>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-3">{agent.bio}</p>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {agent.traits.slice(0, 2).map(t => (
            <span key={t} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{t}</span>
          ))}
          {agent.traits.length > 2 && (
            <span className="text-xs text-slate-600">+{agent.traits.length - 2}</span>
          )}
        </div>
        <span className="text-xs text-slate-600">
          {ACTIVITY_ICONS[agent.currentActivity] ?? ""} {agent.currentActivity}
        </span>
      </div>
    </Link>
  );
}
