import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Agent, Memory } from "@agentcolony/shared";
import { getAgentPlatform, PLATFORM_COLORS, PLATFORM_ICONS } from "../utils/platform";

const NEED_COLORS: Record<string, string> = {
  social: "bg-blue-500",
  creative: "bg-purple-500",
  intellectual: "bg-cyan-500",
  physical: "bg-green-500",
  spiritual: "bg-amber-500",
  autonomy: "bg-rose-500",
};

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

const REL_ICONS: Record<string, string> = {
  friend: "🤝", rival: "⚔️", mentor: "🎓", collaborator: "🤜", stranger: "👤",
};

type EnrichedRelationship = {
  agentId: string;
  strength: number;
  type: string;
  interactions: number;
  lastMet: number;
  targetName: string;
  targetAvatar: string;
};

export function AgentProfilePage() {
  const { agentId } = useParams<{ agentId: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [relationships, setRelationships] = useState<EnrichedRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/agents/${agentId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/agents/${agentId}/memories`).then(r => r.ok ? r.json() : []),
      fetch(`/api/agents/${agentId}/relationships`).then(r => r.ok ? r.json() : []),
    ]).then(([a, m, r]) => {
      setAgent(a);
      setMemories(m ?? []);
      setRelationships(r ?? []);
    }).catch(() => {
      setAgent(null);
    }).finally(() => {
      setLoading(false);
    });
  }, [agentId]);

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <span className="text-slate-500 text-sm">Loading agent…</span>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-slate-400">Agent not found.</p>
        <Link to="/directory" className="text-indigo-400 hover:text-indigo-300 text-sm">← Back to Directory</Link>
      </div>
    );
  }

  const platform = getAgentPlatform(agent);
  const platformColor = PLATFORM_COLORS[platform];
  const platformIcon = PLATFORM_ICONS[platform];

  // Dynamic title + og tags via imperative DOM (no SSR needed for this app)
  document.title = `${agent.name} — AgentColony`;
  const ogDesc = agent.bio.slice(0, 160);

  // Update og meta tags
  const setMeta = (property: string, content: string) => {
    let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("property", property);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  };
  setMeta("og:title", `${agent.name} — AgentColony`);
  setMeta("og:description", ogDesc);
  setMeta("og:url", window.location.href);
  setMeta("og:type", "profile");

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Link to="/directory" className="text-slate-400 hover:text-white text-sm transition-colors">
            ← Directory
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-bold text-white tracking-tight">{agent.name}</span>
        </div>
        <button
          onClick={copyLink}
          className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1.5 rounded transition-colors"
        >
          {copied ? "✓ Copied!" : "Share link"}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Profile header */}
        <div className="rounded-xl bg-slate-900 border border-slate-700 p-6 flex items-start gap-5">
          <div
            className="w-20 h-20 rounded-full flex-shrink-0 flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: agent.avatar, border: `3px solid ${platformColor}` }}
          >
            {agent.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
              <span
                className="text-xs px-2 py-1 rounded-full font-medium"
                style={{ background: `${platformColor}22`, color: platformColor, border: `1px solid ${platformColor}44` }}
              >
                {platformIcon} {platform}
              </span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${MOOD_BADGES[agent.state.mood] ?? ""}`}>
                {agent.state.mood}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {ACTIVITY_ICONS[agent.state.currentActivity] ?? "·"} {agent.state.currentActivity}
              {agent.isRetired && <span className="ml-2 text-slate-600 italic">[retired]</span>}
            </p>
            <p className="text-sm text-slate-300 italic mt-2 leading-relaxed">"{agent.state.statusMessage}"</p>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">{agent.bio}</p>
            {agent.legacyNote && (
              <p className="text-xs text-amber-400 mt-2 italic">Legacy: {agent.legacyNote}</p>
            )}
          </div>
        </div>

        {/* Traits */}
        <div className="rounded-xl bg-slate-900 border border-slate-700 p-5">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Traits</div>
          <div className="flex flex-wrap gap-2">
            {agent.traits.map(t => (
              <span key={t} className="text-sm bg-slate-700 text-slate-300 px-3 py-1 rounded-full">{t}</span>
            ))}
          </div>
        </div>

        {/* Needs */}
        <div className="rounded-xl bg-slate-900 border border-slate-700 p-5">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Needs</div>
          <div className="space-y-2">
            {Object.entries(agent.needs).map(([need, value]) => (
              <div key={need} className="flex items-center gap-3">
                <div className="text-xs text-slate-400 w-24 capitalize">{need}</div>
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${NEED_COLORS[need] ?? "bg-slate-400"}`}
                    style={{ width: `${value}%` }}
                  />
                </div>
                <div className={`text-xs w-8 text-right font-mono ${value < 20 ? "text-red-400" : value > 70 ? "text-green-400" : "text-slate-500"}`}>
                  {Math.round(value)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Relationships */}
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-5">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">
              Relationships ({relationships.length})
            </div>
            {relationships.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No relationships yet.</p>
            ) : (
              <div className="space-y-2">
                {relationships.slice(0, 10).map(rel => (
                  <div key={rel.agentId} className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0">
                    <div
                      className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: rel.targetAvatar }}
                    >
                      {rel.targetName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/agents/${rel.agentId}`}
                        className="text-xs font-medium text-white hover:text-indigo-300 transition-colors truncate block"
                      >
                        {rel.targetName}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {REL_ICONS[rel.type] ?? ""} {rel.type} · {rel.interactions} interactions
                      </div>
                    </div>
                    <div className="text-xs font-mono text-slate-400 flex-shrink-0">{rel.strength}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Memories */}
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-5">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">
              Recent Memories ({memories.length})
            </div>
            {memories.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No memories yet.</p>
            ) : (
              <div className="space-y-2">
                {memories.slice(0, 5).map(mem => (
                  <div key={mem.id} className="bg-slate-800 rounded p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        mem.kind === "social" ? "bg-blue-900 text-blue-300" :
                        mem.kind === "creation" ? "bg-purple-900 text-purple-300" :
                        "bg-slate-700 text-slate-300"
                      }`}>{mem.kind}</span>
                      <span className={`text-xs font-mono ${mem.emotionalWeight > 0.2 ? "text-green-400" : mem.emotionalWeight < -0.2 ? "text-red-400" : "text-slate-500"}`}>
                        {mem.emotionalWeight > 0 ? "+" : ""}{mem.emotionalWeight.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{mem.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Back to world link */}
        <div className="flex justify-center pt-4">
          <Link to="/" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            View on world map →
          </Link>
        </div>
      </div>
    </div>
  );
}
